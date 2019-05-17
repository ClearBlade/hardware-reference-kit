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

  it("preconfigured platform", () => {
    cy.getCy("system-template-id").select(
      "rreinold_anomaly-detection-template"
    );
    cy.getCy("continue").click();
    cy.getCy("edge-id").type("cypressEdge{enter}");
    cy.route({
      method: "POST",
      url: "**/SetupPlatformSystemForEdge",
      response: { results: "hello results!!" }
    }).as("SetupPlatformSystemForEdge");
    cy.getCy("retarget-btn").click();
    cy.wait("@SetupPlatformSystemForEdge").then(req => {
      cy.wrap(req.request.body.DEVELOPER)
        .its("flow")
        .should("eq", "PRECONFIGURED");
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
