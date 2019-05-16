import { RetrieveWorkflowConfig } from "code/services/RetrieveWorkflowConfig/RetrieveWorkflowConfig";
import { WorkflowConfig } from "../Configuration";

// @ts-ignore
global.log = () => {};

describe("Configuration", () => {
  it("calls resp.success with the goods", () => {
    const respMock = {
      success: jest.fn()
    };
    // @ts-ignore
    RetrieveWorkflowConfig({}, respMock);

    expect(respMock.success).toHaveBeenCalled();
    const response: WorkflowConfig = respMock.success.mock.calls[0][0].WORKFLOW;

    expect(typeof response.AUTOROUTE === "boolean").toBe(true);
    expect(typeof response.PLATFORM.route === "boolean").toBe(true);
    expect(typeof response.PLATFORM.flow === "string").toBe(true);
    expect(typeof response.PLATFORM.platformURL === "string").toBe(true);
    expect(typeof response.DEVELOPER.route === "boolean").toBe(true);
    expect(typeof response.DEVELOPER.flow === "string").toBe(true);
    expect(typeof response.DEVELOPER.devEmail === "string").toBe(true);
    expect(typeof response.DEVELOPER.devPassword === "string").toBe(true);
    expect(typeof response.DEVELOPER.key === "string").toBe(true);
    expect(typeof response.SYSTEM.route === "boolean").toBe(true);
    expect(typeof response.SYSTEM.flow === "string").toBe(true);
    expect(typeof response.SYSTEM.systemName === "string").toBe(true);
    expect(typeof response.SYSTEM.systemKey === "string").toBe(true);
    expect(typeof response.SYSTEM.systemSecret === "string").toBe(true);
    expect(typeof response.SYSTEM.repoUser === "string").toBe(true);
    expect(typeof response.SYSTEM.repoName === "string").toBe(true);
    expect(typeof response.SYSTEM.entrypoint === "object").toBe(true);
    expect(typeof response.EDGE.route === "boolean").toBe(true);
    expect(typeof response.EDGE.flow === "string").toBe(true);
    expect(typeof response.EDGE.edgeID === "string").toBe(true);
    expect(typeof response.EDGE.edgeToken === "string").toBe(true);
  });
});
