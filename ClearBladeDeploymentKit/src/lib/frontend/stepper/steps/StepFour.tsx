import * as React from "react";
import { Formik, Form, Field, FieldProps } from "formik";
import FormControl from "@material-ui/core/FormControl";
import FormGroup from "@material-ui/core/FormGroup";
import Button from "@material-ui/core/Button";
import { injectIntl, InjectedIntlProps } from "react-intl";
import * as Yup from "yup";

import FormikInputWrapper, {
  FieldTypes,
  Option
} from "../../../../lib/frontend/FormikInputWrapper";
import { FLOW, EdgeConfiguration } from "../../../../lib/backend/Configuration";
import messages from "../messages";

interface IProps extends EdgeConfiguration, InjectedIntlProps {
  onSubmit: (config: EdgeConfiguration) => void;
}

const StepFour = (props: IProps) => {
  const edgeOptions: Option[] = [
    { value: FLOW.NEW, label: props.intl.formatMessage(messages.newEdge) },
    {
      value: FLOW.EXISTING,
      label: props.intl.formatMessage(messages.existingEdge)
    }
  ];
  return (
    <Formik
      validateOnBlur
      initialValues={
        {
          flow: props.flow,
          edgeID: props.edgeID,
          edgeToken: props.edgeToken
        } as EdgeConfiguration
      }
      validationSchema={Yup.object().shape({
        edgeID: Yup.string().required(
          props.intl.formatMessage(messages.required)
        ),
        edgeToken: Yup.string().when("flow", {
          is: FLOW.EXISTING,
          then: Yup.string().required(
            props.intl.formatMessage(messages.required)
          )
        })
      })}
      onSubmit={values => {
        props.onSubmit(values);
      }}
    >
      {({ handleSubmit, values }) => (
        <Form>
          <FormGroup>
            <FormControl component="fieldset">
              <Field
                name="flow"
                render={({ field, form }: FieldProps) => {
                  return (
                    <FormikInputWrapper
                      type={FieldTypes.RADIO_GROUP}
                      field={field}
                      form={form}
                      label=""
                      options={edgeOptions}
                    />
                  );
                }}
              />
            </FormControl>
            <FormControl>
              <Field
                name="edgeID"
                render={({ field, form }: FieldProps) => {
                  return (
                    <FormikInputWrapper
                      type={FieldTypes.TEXT}
                      field={field}
                      form={form}
                      label={props.intl.formatMessage(messages.edgeID)}
                    />
                  );
                }}
              />
            </FormControl>
            {values.flow === FLOW.EXISTING && (
              <FormControl>
                <Field
                  name="edgeToken"
                  render={({ field, form }: FieldProps) => {
                    return (
                      <FormikInputWrapper
                        type={FieldTypes.TEXT}
                        field={field}
                        form={form}
                        label={props.intl.formatMessage(messages.edgeToken)}
                      />
                    );
                  }}
                />
              </FormControl>
            )}
            <FormControl>
              <Button
                variant="contained"
                color="primary"
                type="submit"
                onSubmit={handleSubmit}
              >
                Continue
              </Button>
            </FormControl>
          </FormGroup>
        </Form>
      )}
    </Formik>
  );
};

export default injectIntl(StepFour);
