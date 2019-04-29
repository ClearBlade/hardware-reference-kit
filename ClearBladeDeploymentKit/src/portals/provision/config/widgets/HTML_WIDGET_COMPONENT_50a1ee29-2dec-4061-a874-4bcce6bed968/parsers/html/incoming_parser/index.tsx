import * as React from "react";
import * as ReactDOM from "react-dom";
import Stepper from "@material-ui/core/Stepper";
import Step from "@material-ui/core/Step";
import StepButton from "@material-ui/core/StepButton";
import StepContent from "@material-ui/core/StepContent";
import Button from "@material-ui/core/Button";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import {
  FormattedMessage,
  IntlProvider,
  injectIntl,
  InjectedIntlProps
} from "react-intl";

import messages from "../../../../../../../../lib/frontend/stepper/messages";
import PlatformConfigurationStep from "../../../../../../../../lib/frontend/stepper/steps/PlatformConfigurationStep";
import DeveloperConfigurationStep from "../../../../../../../../lib/frontend/stepper/steps/DeveloperConfigurationStep";
import SystemConfigurationStep from "../../../../../../../../lib/frontend/stepper/steps/SystemConfigurationStep";
import EdgeConfigurationStep from "../../../../../../../../lib/frontend/stepper/steps/EdgeConfigurationStep";
import TargetStep from "../../../../../../../../lib/frontend/stepper/steps/TargetStep";
import {
  FLOW,
  TARGET_CONFIGURATION,
  Configuration,
  PlatformConfiguration,
  DeveloperConfiguration,
  SystemConfiguration,
  EdgeConfiguration
} from "../../../../../../../../lib/backend/Configuration";
import ResponsiveDialog from "../../../../../../../../lib/frontend/ResponsiveDialog";

// existing vs preconfigured platform
// existing -> enter platform URL - TEXT
// preconfigured -> continue

// new developer vs existing developer
// existing -> enter creds - TEXT
// new -> enter email, confirm password - TEXT and PASSWORD

// new IPM system vs existing system vs new EMPTY system
// existing system -> enter system key, secret, provisioner email and password - TEXT and PASSWORD
// EMPTY system -> enter system name - TEXT
// IPM system -> select template from dropdown - SELECT

// new edge vs existing edge
// new edge -> enter edge name - TEXT
// existing edge -> enter edge name, edge token - TEXT

// retarget (show config)

// workflow config -
/*
{
	"results": {
		"PORTAL": {
			"AUTOROUTE": false
		},
		"TARGET": {
			"IPM_ENTRYPOINT": {
				"portal": "smart_monitoring"
			},
			"IPM_REPO_NAME": "dev-smart-monitoring",
			"IPM_REPO_USER": "aalcott14",
			"PROVISIONER_USER_EMAIL": "provisioner@clearblade.com",
			"REGISTRATION_KEY": "AMDBlade",
			"URL": "https://amd.clearblade.com"
		},
		"WORKFLOW": {
			"AUTOROUTE": false,
			"DEVELOPER": {
				"devEmail": "",
				"devPassword": "",
				"flow": "NEW",
				"key": "AMDBlade",
				"route": false
			},
			"EDGE": {
				"edgeID": "",
				"edgeToken": "",
				"flow": "NEW",
				"route": false
			},
			"PLATFORM": {
				"flow": "PRECONFIGURED",
				"platformURL": "https://amd.clearblade.com",
				"route": false
			},
			"SYSTEM": {
				"entrypoint": {
					"portal": "smart_monitoring"
				},
				"flow": "IPM",
				"provEmail": "provisioner@clearblade.com",
				"provPassword": "clearblade",
				"repoName": "dev-smart-monitoring",
				"repoUser": "aalcott14",
				"route": false,
				"systemKey": "",
				"systemName": "",
				"systemSecret": ""
			}
		},
		"WORKFLOW_MAP": {
			"DEVELOPER": {},
			"EDGE": {},
			"PLATFORM": {},
			"SYSTEM": {}
		}
	},
	"success": true
}
*/

function getSteps() {
  return [
    <FormattedMessage {...messages.platform} />,
    <FormattedMessage {...messages.developer} />,
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
  activeStep: number;
  targetError: any;
}

class VerticalLinearStepper extends React.Component<{}, IState> {
  state = {
    activeStep: 4,
    targetError: null,
    workflowConfig: {
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
    }
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
    ).then(resp => {
      console.log("resp", resp);
      if (!resp.success) {
        console.log("call setstate");
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
    const steps = getSteps();
    const { activeStep, targetError } = this.state;

    console.log("render", targetError);

    return (
      <IntlProvider>
        <div>
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
ReactDOM.unmountComponentAtNode(MOUNT_NODE as HTMLElement);

ReactDOM.render(<VerticalLinearStepper />, MOUNT_NODE);
