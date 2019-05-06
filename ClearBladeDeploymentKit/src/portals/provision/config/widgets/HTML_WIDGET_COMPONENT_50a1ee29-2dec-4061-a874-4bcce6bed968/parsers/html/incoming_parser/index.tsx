import * as React from "react";
import * as ReactDOM from "react-dom";
import Stepper from "@material-ui/core/Stepper";
import Step from "@material-ui/core/Step";
import StepButton from "@material-ui/core/StepButton";
import StepContent from "@material-ui/core/StepContent";
import Button from "@material-ui/core/Button";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import { FormattedMessage, IntlProvider } from "react-intl";

import messages from "../../../../../../../../lib/frontend/stepper/messages";
import PlatformConfigurationStep from "../../../../../../../../lib/frontend/stepper/steps/PlatformConfigurationStep";
import DeveloperConfigurationStep from "../../../../../../../../lib/frontend/stepper/steps/DeveloperConfigurationStep";
import SystemConfigurationStep from "../../../../../../../../lib/frontend/stepper/steps/SystemConfigurationStep";
import EdgeConfigurationStep from "../../../../../../../../lib/frontend/stepper/steps/EdgeConfigurationStep";
import TargetStep from "../../../../../../../../lib/frontend/stepper/steps/TargetStep";
import CONFIGURATION, {
  Configuration,
  PlatformConfiguration,
  DeveloperConfiguration,
  SystemConfiguration,
  EdgeConfiguration,
  FLOW,
  TARGET_CONFIGURATION,
  WorkflowConfig
} from "../../../../../../../../lib/backend/Configuration";
import ResponsiveDialog from "../../../../../../../../lib/frontend/ResponsiveDialog";

function getSteps(config: Configuration) {
  return [
    config.PLATFORM.flow === FLOW.PRECONFIGURED ? (
      <FormattedMessage {...messages.platformPreconfigured} />
    ) : (
      <FormattedMessage {...messages.platform} />
    ),
    config.DEVELOPER.flow === FLOW.PRECONFIGURED ? (
      <FormattedMessage {...messages.developerPreconfigured} />
    ) : (
      <FormattedMessage {...messages.developer} />
    ),
    <FormattedMessage {...messages.system} />,
    <FormattedMessage {...messages.edge} />,
    <FormattedMessage {...messages.retarget} />
  ];
}

function getStepContent(step: number, state: IState, handlers: SubmitHandlers) {
  switch (step) {
    case 0:
      return (
        <PlatformConfigurationStep
          {...state.workflowConfig.PLATFORM}
          onSubmit={handlers.platformConfiguration}
        />
      );
    case 1:
      return (
        <DeveloperConfigurationStep
          {...state.workflowConfig.DEVELOPER}
          onSubmit={handlers.developerConfiguration}
        />
      );
    case 2:
      return (
        <SystemConfigurationStep
          {...state.workflowConfig.SYSTEM}
          templateOptions={state.templateOptions}
          onSubmit={handlers.systemConfiguration}
        />
      );
    case 3:
      return (
        <EdgeConfigurationStep
          {...state.workflowConfig.EDGE}
          onSubmit={handlers.edgeConfiguration}
        />
      );
    case 4:
      return (
        <TargetStep
          config={state.workflowConfig}
          updateConfig={handlers.updateConfiguration}
          onSubmit={handlers.onSubmit}
        />
      );
    default:
      return "Unknown step";
  }
}

interface SubmitHandlers {
  platformConfiguration: VerticalLinearStepper["submitPlatformConfiguration"];
  developerConfiguration: VerticalLinearStepper["submitDeveloperConfiguration"];
  systemConfiguration: VerticalLinearStepper["submitSystemConfiguration"];
  edgeConfiguration: VerticalLinearStepper["submitEdgeConfiguration"];
  updateConfiguration: VerticalLinearStepper["updateConfiguration"];
  onSubmit: VerticalLinearStepper["onSubmit"];
}

interface IState {
  workflowConfig: Configuration;
  templateOptions: typeof CONFIGURATION["TEMPLATE_OPTIONS"];
  activeStep: number;
  targetError: any;
  fetchedWorkflowConfig: boolean;
}

const configTemplate = {
  PLATFORM: {
    flow: FLOW.EXISTING,
    platformURL: ""
  },
  DEVELOPER: {
    flow: FLOW.NEW,
    devEmail: "",
    devPassword: "",
    key: ""
  },
  SYSTEM: {
    flow: FLOW.IPM,
    systemName: "",
    systemKey: "",
    systemSecret: "",
    provEmail: "provisioner@clearblade.com",
    provPassword: "clearblade",
    repoUser: TARGET_CONFIGURATION.IPM_REPO_USER,
    repoName: TARGET_CONFIGURATION.IPM_REPO_NAME,
    entrypoint: TARGET_CONFIGURATION.IPM_ENTRYPOINT
  },
  EDGE: {
    flow: FLOW.NEW,
    edgeID: "",
    edgeToken: ""
  }
};

class VerticalLinearStepper extends React.Component<{}, IState> {
  config: WorkflowConfig = {
    AUTOROUTE: false,
    ...configTemplate,
    PLATFORM: {
      ...configTemplate.PLATFORM,
      route: false
    },
    DEVELOPER: {
      ...configTemplate.DEVELOPER,
      route: false
    },
    SYSTEM: {
      ...configTemplate.SYSTEM,
      route: false
    },
    EDGE: {
      ...configTemplate.EDGE,
      route: false
    }
  };
  state = {
    activeStep: 0,
    targetError: null,
    workflowConfig: configTemplate,
    templateOptions: [],
    fetchedWorkflowConfig: false
  };

  componentDidMount() {
    this.retrieveWorkflowConfig().then(results => {
      this.config = results.WORKFLOW;
      this.setState({
        workflowConfig: results.WORKFLOW,
        templateOptions: results.TEMPLATE_OPTIONS,
        fetchedWorkflowConfig: true
      });
      if (
        this.config.PLATFORM.route &&
        this.config.PLATFORM.flow === FLOW.PRECONFIGURED
      ) {
        this.submitPlatformConfiguration(this.config.PLATFORM);
      }
    });
  }

  retrieveWorkflowConfig = (): Promise<typeof CONFIGURATION> => {
    return new Promise(res => {
      if (datasources.RetrieveWorkflowConfig.latestData()) {
        res(datasources.RetrieveWorkflowConfig.latestData().results);
      } else {
        datasources.RetrieveWorkflowConfig.latestData.subscribe(handle);
      }
      function handle(data: { results: typeof CONFIGURATION }) {
        datasources.RetrieveWorkflowConfig.latestData.unsubscribe(handle);
        res(data.results);
      }
    });
  };

  jumpToStep = (idx: number) => {
    this.setState({
      activeStep: idx
    });
  };

  handleNext = () => {
    this.setState(state => ({
      activeStep: state.activeStep + 1
    }));
  };

  handleBack = () => {
    this.setState(state => ({
      activeStep: state.activeStep - 1
    }));
  };

  handleReset = () => {
    this.setState({
      activeStep: 0
    });
  };

  submitPlatformConfiguration = (config: PlatformConfiguration) => {
    this.setState(state => ({
      activeStep: state.activeStep + 1,
      workflowConfig: {
        ...state.workflowConfig,
        PLATFORM: config
      }
    }));
    if (
      this.config.DEVELOPER.route &&
      this.state.workflowConfig.DEVELOPER.flow === FLOW.PRECONFIGURED
    ) {
      this.submitDeveloperConfiguration(this.state.workflowConfig.DEVELOPER);
    }
  };

  submitDeveloperConfiguration = (config: DeveloperConfiguration) => {
    this.setState(state => ({
      activeStep: state.activeStep + 1,
      workflowConfig: {
        ...state.workflowConfig,
        DEVELOPER: config
      }
    }));
  };

  submitSystemConfiguration = (config: SystemConfiguration) => {
    this.setState(state => ({
      activeStep: state.activeStep + 1,
      workflowConfig: {
        ...state.workflowConfig,
        SYSTEM: config
      }
    }));
  };

  submitEdgeConfiguration = (config: EdgeConfiguration) => {
    this.setState(state => ({
      activeStep: state.activeStep + 1,
      workflowConfig: {
        ...state.workflowConfig,
        EDGE: config
      }
    }));
  };

  updateConfiguration = (config: Configuration) => {
    this.setState(state => ({
      workflowConfig: config
    }));
  };

  onSubmit = () => {
    const prom = datasources.SetupPlatformSystemForEdge.sendData(
      this.state.workflowConfig
    ).then((resp: { success: boolean; results: string }) => {
      if (!resp.success) {
        this.setState({
          targetError: resp.results
        });
      } else {
      }
    });
    CB_PORTAL.Loader.waitFor(prom);
  };

  closeErrorModal = () => {
    this.setState({
      targetError: null
    });
  };

  render() {
    const steps = getSteps(this.state.workflowConfig);
    const { activeStep, targetError, fetchedWorkflowConfig } = this.state;

    return (
      <IntlProvider>
        <div>
          {fetchedWorkflowConfig && (
            <Stepper activeStep={activeStep} orientation="vertical">
              {steps.map((msg, index) => (
                <Step key={index}>
                  <StepButton
                    onClick={() => this.jumpToStep(index)}
                    // completed={this.state.completed[index]}
                  >
                    {msg}
                  </StepButton>
                  <StepContent>
                    {getStepContent(index, this.state, {
                      platformConfiguration: this.submitPlatformConfiguration,
                      developerConfiguration: this.submitDeveloperConfiguration,
                      systemConfiguration: this.submitSystemConfiguration,
                      edgeConfiguration: this.submitEdgeConfiguration,
                      updateConfiguration: this.updateConfiguration,
                      onSubmit: this.onSubmit
                    })}
                  </StepContent>
                </Step>
              ))}
            </Stepper>
          )}
          {activeStep === steps.length && (
            <Paper square elevation={0}>
              <Typography>
                All steps completed - you&apos;re finished
              </Typography>
              <Button onClick={this.handleReset}>Reset</Button>
            </Paper>
          )}
          {targetError && (
            <ResponsiveDialog
              bodyText={targetError}
              headerMsg={messages.targetErrorHeader}
              onClose={this.closeErrorModal}
            />
          )}
        </div>
      </IntlProvider>
    );
  }
}

const MOUNT_NODE = document.getElementById("deployment-kit-stepper");
// ReactDOM.unmountComponentAtNode(MOUNT_NODE as HTMLElement);

ReactDOM.render(<VerticalLinearStepper />, MOUNT_NODE);
