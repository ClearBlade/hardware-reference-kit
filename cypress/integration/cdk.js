import { CDK_PORTAL_URL } from "../support";

describe("cdk", () => {
  beforeEach(() => {
    cy.visit(CDK_PORTAL_URL);
  });

  it("preconfigured platform", () => {
    cy.getCy("begin").click();
  });

  //   it("existing platform", () => {});

  //   it("new developer", () => {});

  //   it("existing developer", () => {});

  //   // it('preconfigured developer?', () => {

  //   // })

  //   it("existing system", () => {});

  //   it("template system", () => {});
});
