/*!
 * ${copyright}
 */
sap.ui.require([
	"sap/ui/model/Context",
	"sap/ui/model/odata/ODataUtils",
	"sap/ui/model/odata/v4/_ODataHelper",
	"sap/ui/model/odata/v4/_SyncPromise"
], function (Context, ODataUtils, Helper, SyncPromise) {
	/*global QUnit, sinon */
	/*eslint no-warning-comments: 0 */
	"use strict";

	//*********************************************************************************************
	QUnit.module("sap.ui.model.odata.v4._ODataHelper", {
		beforeEach : function () {
			this.oSandbox = sinon.sandbox.create();
			this.oLogMock = this.oSandbox.mock(jQuery.sap.log);
			this.oLogMock.expects("warning").never();
			this.oLogMock.expects("error").never();
		},

		afterEach : function () {
			this.oSandbox.verifyAndRestore();
		}
	});

	//*********************************************************************************************
	QUnit.test("findInArray", function (assert) {
		var aArray = [{
				"name" : "foo"
			}, {
				"name" : "bar"
			}];

		assert.strictEqual(Helper.findInArray(aArray, "name", "foo"), aArray[0]);
		assert.strictEqual(Helper.findInArray(aArray, "name", "bar"), aArray[1]);
		assert.strictEqual(Helper.findInArray(aArray, "name", "baz"), undefined);
	});

	//*********************************************************************************************
	QUnit.test("splitPath", function (assert) {
		assert.throws(function () {
			Helper.splitPath("foo");
		}, new Error("Not an absolute path: foo"));
		assert.deepEqual(Helper.splitPath("/"), []);
		assert.deepEqual(Helper.splitPath("/EntityContainer"), ["EntityContainer"]);
		assert.deepEqual(Helper.splitPath("/EntityContainer/EntitySet/Link"),
			["EntityContainer", "EntitySet", "Link"]);
		assert.deepEqual(Helper.splitPath(
			"/EntityContainer/EntitySet('foo.Container%2FBars')/Link"),
			["EntityContainer", "EntitySet('foo.Container%2FBars')", "Link"]);
	});

	//*********************************************************************************************
	QUnit.test("parseSegment", function (assert) {
		assert.deepEqual(Helper.parseSegment(undefined), undefined);
		assert.deepEqual(Helper.parseSegment("Types"), {
			segment: "Types",
			property: "Types"
		});
		assert.deepEqual(Helper.parseSegment("EntitySets('Employees')"), {
			segment: "EntitySets('Employees')",
			property: "EntitySets",
			name: "Employees"
		});
	});

	//*********************************************************************************************
	QUnit.test("resolveNavigationPropertyBindings", function (assert) {
		var oEntityContainer = {
				"EntitySets" : [{
					"Name" : "Set1",
					"Fullname" : "foo.bar.Container/Set1",
					"NavigationPropertyBindings" : [{
						"Path" : "ToSet2",
						"Target" : {
							"Fullname" : "foo.bar.Container/Set2"
						}
					}, {
						"Path" : "ToForeignSet",
						"Target" : {
							"Fullname" : "bar.baz.Container/Set3"
						}
					}, {
						"Path" : "ToSingleton",
						"Target" : {
							"Fullname" : "foo.bar.Container/Singleton"
						}
					}]
				}, {
					"Fullname" : "foo.bar.Container/Set2",
					"NavigationPropertyBindings" : []
				}],
				"Singletons" : [{
					"Name" : "Singleton",
					"Fullname" : "foo.bar.Container/Singleton",
					"NavigationPropertyBindings" : [{
						"Path" : "ToSet1",
						"Target" : {
							"Fullname" : "foo.bar.Container/Set1"
						}
					}]
				}]
			};

		Helper.resolveNavigationPropertyBindings(oEntityContainer);
		assert.strictEqual(oEntityContainer.EntitySets[0].NavigationPropertyBindings[0].Target,
			oEntityContainer.EntitySets[1]);
		assert.ok(oEntityContainer.EntitySets[0].NavigationPropertyBindings[1].Target);
		assert.strictEqual(oEntityContainer.EntitySets[0].NavigationPropertyBindings[2].Target,
			oEntityContainer.Singletons[0]);
		assert.strictEqual(oEntityContainer.Singletons[0].NavigationPropertyBindings[0].Target,
			oEntityContainer.EntitySets[0]);
		[
			oEntityContainer.EntitySets[0].NavigationPropertyBindings[0],
			oEntityContainer.EntitySets[0].NavigationPropertyBindings[2],
			oEntityContainer.Singletons[0].NavigationPropertyBindings[0]
		].forEach(function (oBinding) {
			if (oBinding.Target.Name) {
				assert.strictEqual(oBinding.Name, oBinding.Path);
			}
		});
	});

	//*********************************************************************************************
	QUnit.test("fetchEntityContainer", function (assert) {
		var oEntityContainer = {},
			oMetaModel = {
				oModel: {
					fetchEntityContainer: function () {}
				}
			},
			oPromise;

		this.oSandbox.mock(oMetaModel.oModel).expects("fetchEntityContainer")
			.withExactArgs()
			.returns(SyncPromise.resolve(oEntityContainer));
		this.oSandbox.mock(Helper).expects("resolveNavigationPropertyBindings")
			.withExactArgs(oEntityContainer);

		oPromise = Helper.fetchEntityContainer(oMetaModel);
		assert.strictEqual(Helper.fetchEntityContainer(oMetaModel), oPromise);

		assert.strictEqual(oPromise.getResult(), oEntityContainer, "sync promise fulfilled");
	});

	//*********************************************************************************************
	QUnit.test("fetchTypeForNavigationProperty: success incl. cache", function (assert) {
		var oSource1 = {
				"Type" : {
					"QualifiedName" : "foo.Bar"
				}
			},
			oSource2 = {
				"EntityType" : {
					"QualifiedName" : "foo.Bar"
				}
			},
			oResolvedType = {
				"Name" : "Bar",
				"QualifiedName" : "foo.Bar"
			},
			oEntityContainer = {},
			oMetaModel = {
				oModel : {
					fetchEntityType : function () {}
				}
			};

		this.oSandbox.mock(Helper).expects("fetchEntityContainer").twice()
			.withExactArgs(oMetaModel)
			.returns(SyncPromise.resolve(oEntityContainer));
		this.oSandbox.mock(oMetaModel.oModel).expects("fetchEntityType")
			.withExactArgs("foo.Bar")
			.returns(SyncPromise.resolve(oResolvedType));

		assert.strictEqual(
			Helper.fetchTypeForNavigationProperty(oMetaModel, oSource1, "Type").getResult(),
			oResolvedType, "sync promise fulfilled");
		assert.strictEqual(oSource1.Type, oResolvedType);
		assert.strictEqual(oEntityContainer.Types[0], oResolvedType);

		assert.strictEqual(
			Helper.fetchTypeForNavigationProperty(oMetaModel, oSource2, "EntityType")
				.getResult(),
			oResolvedType, "sync promise fulfilled");
	});

	//*********************************************************************************************
	QUnit.test("fetchTypeForNavigationProperty: already resolved", function (assert) {
		var oSource = {
				"Type" : {
					"Name" : "Bar",
					"QualifiedName" : "foo.Bar",
					"Properties" : []
				}
			},
			oMetaModel = {
				oModel : {
					read: function () {}
				}
			};

		this.oSandbox.mock(oMetaModel.oModel).expects("read").never();

		assert.strictEqual(
			Helper.fetchTypeForNavigationProperty(oMetaModel, oSource, "Type").getResult(),
			oSource.Type, "sync promise fulfilled");
	});

	//*********************************************************************************************
	[{
		sKeyPredicate : "(ID='42')",
		oEntityInstance : {"ID" : "42"},
		oEntityType : {
			"Properties" : [{
				"Name" : "ID",
				"Type" : {
					"QualifiedName" : "Edm.String"
				}
			}],
			"Key" : [{
				"PropertyPath" : "ID"
			}]
		}
	}, {
		sKeyPredicate : "(Sector='DevOps',ID='42')",
		oEntityInstance : {"ID" : "42", "Sector" : "DevOps"},
		oEntityType : {
			"Properties" : [{
				"Name" : "Sector",
				"Type" : {
					"QualifiedName" : "Edm.String"
				}
			}, {
				"Name" : "ID",
				"Type" : {
					"QualifiedName" : "Edm.String"
				}
			}],
			"Key" : [{
				"PropertyPath" : "Sector"
			}, {
				"PropertyPath" : "ID"
			}]
		}
	}, {
		sKeyPredicate : "(Bar=42,Fo%3Do='Walter%22s%20Win''s')",
		oEntityInstance : {
			"Bar" : 42,
			"Fo=o" : "Walter\"s Win's"
		},
		oEntityType : {
			"Properties" : [{
				"Name" : "Bar",
				"Type" : {
					"QualifiedName" : "Edm.Int16"
				}
			}, {
				"Name" : "Fo=o",
				"Type" : {
					"QualifiedName" : "Edm.String"
				}
			}],
			"Key" : [{
				"PropertyPath" : "Bar"
			}, {
				"PropertyPath" : "Fo=o"
			}]
		}
	}].forEach(function (oFixture) {
		QUnit.test("getKeyPredicate: " + oFixture.sKeyPredicate, function (assert) {
			this.oSandbox.spy(ODataUtils, "formatValue"); //TODO v2 vs. v4?

			assert.strictEqual(
				Helper.getKeyPredicate(oFixture.oEntityType, oFixture.oEntityInstance),
				oFixture.sKeyPredicate);

			// check that ODataUtils.formatValue() is called for each property
			oFixture.oEntityType.Properties.forEach(function (oProperty) {
				assert.ok(
					ODataUtils.formatValue.calledWithExactly(
						oFixture.oEntityInstance[oProperty.Name], oProperty.Type.QualifiedName),
					ODataUtils.formatValue.printf(
						"ODataUtils.formatValue('" + oProperty.Name + "',...) %C"));
			});
		});
	});
});
