import * as React from "react";
import { Formik, Form } from "formik";
import FormControl from "@material-ui/core/FormControl";
import FormGroup from "@material-ui/core/FormGroup";
import Button from "@material-ui/core/Button";
import { injectIntl, InjectedIntlProps, FormattedMessage } from "react-intl";

import { Configuration } from "../../../backend/Configuration";
import messages from "../messages";

interface IProps extends InjectedIntlProps {
  config: Configuration;
  updateConfig: (c: Configuration) => void;
  onSubmit: () => void;
}

interface IState {
  didMount: boolean;
}

class TargetStep extends React.Component<IProps, IState> {
  state = {
    didMount: false
  };

  componentDidMount() {
    // added this hack to re-render the JsonEditor after mounting because of the way the JsonEditor sets its state (it does so inside componentWillReceiveProps)
    this.setState({
      didMount: true
    });
  }

  updateConfig = (value: Configuration) => {
    this.props.updateConfig(value);
  };

  render() {
    const JsonEditor = CB_PORTAL.portalModel.widgetTypes.JsonEditorWidget.class;
    return (
      <Formik
        validateOnBlur
        initialValues={this.props}
        validationSchema={{}}
        onSubmit={this.props.onSubmit}
      >
        {({ handleSubmit }) => (
          <Form>
            <FormGroup>
              <FormControl>
                <Button
                  variant="contained"
                  color="primary"
                  type="submit"
                  onSubmit={handleSubmit}
                >
                  <FormattedMessage {...messages.retarget} />
                </Button>
              </FormControl>
            </FormGroup>
            <div style={{ height: "400px" }}>
              <JsonEditor
                settings={{
                  buttonColor: "#3f51b5"
                }}
                data={{ textContent: this.props.config }}
                updateCallback={this.updateConfig}
              />
            </div>
          </Form>
        )}
      </Formik>
    );
  }
}

export default injectIntl(TargetStep);
