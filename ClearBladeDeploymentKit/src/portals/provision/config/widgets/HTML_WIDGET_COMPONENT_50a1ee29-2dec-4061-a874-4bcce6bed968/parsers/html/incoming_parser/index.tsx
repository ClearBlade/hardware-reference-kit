import * as React from "react";
import * as ReactDOM from "react-dom";
import Stepper from "@material-ui/core/Stepper";
import Step from "@material-ui/core/Step";
import StepLabel from "@material-ui/core/StepLabel";
import StepContent from "@material-ui/core/StepContent";
import Button from "@material-ui/core/Button";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import { FormattedMessage, IntlProvider } from "react-intl";

import messages from "./messages";
import StepOne from "./steps/StepOne";
import { IStepProps } from "./steps/shared";

/*
so we have this concept of steps
what is a step?
a step generally asks users to input some data, select from a list, etc.
some steps can get into states where they don't require any user input (e.g., preconfigured platform)
- each "configuration" step has at least two options
- each "configuration" step should have validation 
  - question is...who is responsible for determining that a step is valid?
  should it be the substeps job? I think so since each substep will have it's own formik form it will need to alert the parent when it is valid
  maybe we could do the render prop thing for the step buttons
*/

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

function getStepContent(step: number, props: IStepProps) {
  switch (step) {
    case 0:
      return <StepOne {...props} />;
    case 1:
      return "An ad group contains one or more ads which target a shared set of keywords.";
    case 2:
      return `Try out different ad text to see what brings in the most customers,
                and learn how to enhance your ads using features like ad extensions.
                If you run into any problems with your ads, find out how to tell if
                they're running and how to resolve approval issues.`;
    default:
      return "Unknown step";
  }
}

interface IState {
  activeStep: number;
}

class VerticalLinearStepper extends React.Component<{}, IState> {
  state = {
    activeStep: 0
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

  componentDidMount() {
    console.log("DID MOUNT!");
  }

  componentWillUnmount() {
    console.log("WILL UNMOUNT!");
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
                <StepLabel>{msg}</StepLabel>
                <StepContent>
                  {getStepContent(index, {
                    onComplete: () => console.log("complete")
                  })}
                  <div>
                    <div>
                      <Button
                        disabled={activeStep === 0}
                        onClick={this.handleBack}
                      >
                        Hello
                      </Button>
                      <Button
                        variant="contained"
                        color="primary"
                        onClick={this.handleNext}
                      >
                        {activeStep === steps.length - 1 ? "Finish" : "Next"}
                      </Button>
                    </div>
                  </div>
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

ReactDOM.render(
  <VerticalLinearStepper />,
  document.getElementById("deployment-kit-stepper")
);
