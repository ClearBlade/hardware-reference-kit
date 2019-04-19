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
import StepOne from "../../../../../../../../lib/frontend/stepper/steps/StepOne";
import StepTwo from "../../../../../../../../lib/frontend/stepper/steps/StepTwo";
import StepThree from "../../../../../../../../lib/frontend/stepper/steps/StepThree";
import {
  FLOW,
  TARGET_CONFIGURATION,
  Configuration,
  PlatformConfiguration,
  DeveloperConfiguration,
  SystemConfiguration
} from "../../../../../../../../lib/backend/Configuration";

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
    <FormattedMessage {...messages.edge} />
  ];
}

function getStepContent(step: number, state: IState, handlers: SubmitHandlers) {
  switch (step) {
    case 0:
      return (
        <StepOne
          {...state.workflowConfig.PLATFORM}
          onSubmit={handlers.stepOne}
        />
      );
    case 1:
      return (
        <StepTwo
          {...state.workflowConfig.DEVELOPER}
          onSubmit={handlers.stepTwo}
        />
      );
    case 2:
      return (
        <StepThree
          {...state.workflowConfig.SYSTEM}
          onSubmit={handlers.stepThree}
        />
      );
    default:
      return "Unknown step";
  }
}

interface SubmitHandlers {
  stepOne: VerticalLinearStepper["submitStepOne"];
  stepTwo: VerticalLinearStepper["submitStepTwo"];
  stepThree: VerticalLinearStepper["submitStepThree"];
}

interface IState {
  workflowConfig: Configuration;
  activeStep: number;
}

class VerticalLinearStepper extends React.Component<{}, IState> {
  state = {
    activeStep: 0,
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
      ...this.state,
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

  submitStepOne = (config: PlatformConfiguration) => {
    this.setState(state => ({
      ...state,
      activeStep: state.activeStep + 1,
      workflowConfig: {
        ...state.workflowConfig,
        PLATFORM: config
      }
    }));
  };

  submitStepTwo = (config: DeveloperConfiguration) => {
    this.setState(state => ({
      ...state,
      activeStep: state.activeStep + 1,
      workflowConfig: {
        ...state.workflowConfig,
        DEVELOPER: config
      }
    }));
  };

  submitStepThree = (config: SystemConfiguration) => {
    this.setState(state => ({
      ...state,
      activeStep: state.activeStep + 1,
      workflowConfig: {
        ...state.workflowConfig,
        SYSTEM: config
      }
    }));
  };

  componentDidMount() {
    console.log("DID MOUNT!");
  }

  render() {
    const steps = getSteps();
    const { activeStep } = this.state;

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
                    stepOne: this.submitStepOne,
                    stepTwo: this.submitStepTwo,
                    stepThree: this.submitStepThree
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
        </div>
      </IntlProvider>
    );
  }
}

const MOUNT_NODE = document.getElementById("deployment-kit-stepper");
ReactDOM.unmountComponentAtNode(MOUNT_NODE as HTMLElement);

ReactDOM.render(<VerticalLinearStepper />, MOUNT_NODE);
