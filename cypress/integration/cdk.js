import { CDK_PORTAL_URL } from "../support";

describe("preconfigured platform and developer", () => {
  beforeEach(() => {
    cy.server();
    cy.visit(CDK_PORTAL_URL);
    cy.fixture("preconfiguredFlows/platformAndDeveloper").as("fxWorkflow");
    cy.route("POST", "**/RetrieveWorkflowConfig", "@fxWorkflow").as(
      "preconfiguredPlatformAndDeveloper"
    );

    cy.wait("@preconfiguredPlatformAndDeveloper");
    cy.getCy("begin").click();
  });

  it("should only need to set up system and edge info", () => {
    cy.getCy("system-template-id").select(
      "rreinold_anomaly-detection-template"
    );
    cy.getCy("continue").click();
    cy.getCy("edge-options").within(() => {
      cy.getCy("option-NEW").click();
    });
    cy.getCy("edge-id").type("cypressEdge{enter}");
    cy.route({
      method: "POST",
      url: "**/SetupPlatformSystemForEdge",
      response: { results: "hello results!!" }
    }).as("SetupPlatformSystemForEdge");
    cy.getCy("retarget-btn").click();
    cy.wait("@SetupPlatformSystemForEdge").then(req => {
      cy.wrap(req.request.body.PLATFORM)
        .its("flow")
        .should("eq", "PRECONFIGURED");
      cy.wrap(req.request.body.DEVELOPER)
        .its("flow")
        .should("eq", "PRECONFIGURED");
      cy.wrap(req.request.body.SYSTEM)
        .its("flow")
        .should("eq", "IPM");
      cy.wrap(req.request.body.SYSTEM)
        .its("repoName")
        .should("eq", "anomaly-detection-template");
      cy.wrap(req.request.body.EDGE)
        .its("flow")
        .should("eq", "NEW");
      cy.wrap(req.request.body.EDGE)
        .its("edgeID")
        .should("eq", "cypressEdge");
    });
  });
});

describe("preconfigured platform", () => {
  beforeEach(() => {
    cy.server();
    cy.visit(CDK_PORTAL_URL);
    cy.fixture("preconfiguredFlows/platform").as("fxWorkflow");
    cy.route("POST", "**/RetrieveWorkflowConfig", "@fxWorkflow").as(
      "preconfiguredPlatform"
    );

    cy.wait("@preconfiguredPlatform");
    cy.getCy("begin").click();
  });

  it("should not need to set up platform info", () => {
    cy.getCy("dev-email").type("a@cypress.com");
    cy.getCy("dev-password").type("cypress{enter}");
    cy.getCy("system-template-id").select(
      "rreinold_anomaly-detection-template"
    );
    cy.getCy("continue").click();
    cy.getCy("edge-options").within(() => {
      cy.getCy("option-NEW").click();
    });
    cy.getCy("edge-id").type("cypressEdge{enter}");
    cy.route({
      method: "POST",
      url: "**/SetupPlatformSystemForEdge",
      response: { results: "hello results!!" }
    }).as("SetupPlatformSystemForEdge");
    cy.getCy("retarget-btn").click();
    cy.wait("@SetupPlatformSystemForEdge").then(req => {
      cy.wrap(req.request.body.PLATFORM)
        .its("flow")
        .should("eq", "PRECONFIGURED");
      cy.wrap(req.request.body.DEVELOPER)
        .its("flow")
        .should("eq", "EXISTING");
      cy.wrap(req.request.body.DEVELOPER)
        .its("devEmail")
        .should("eq", "a@cypress.com");
      cy.wrap(req.request.body.DEVELOPER)
        .its("devPassword")
        .should("eq", "cypress");
      cy.wrap(req.request.body.SYSTEM)
        .its("flow")
        .should("eq", "IPM");
      cy.wrap(req.request.body.SYSTEM)
        .its("repoName")
        .should("eq", "anomaly-detection-template");
      cy.wrap(req.request.body.EDGE)
        .its("flow")
        .should("eq", "NEW");
      cy.wrap(req.request.body.EDGE)
        .its("edgeID")
        .should("eq", "cypressEdge");
    });
  });
});

//   it("existing platform", () => {});

//   it("new developer", () => {});

//   it("existing developer", () => {});

//   // it('preconfigured developer?', () => {

//   // })

//   it("existing system", () => {});

//   it("template system", () => {});
