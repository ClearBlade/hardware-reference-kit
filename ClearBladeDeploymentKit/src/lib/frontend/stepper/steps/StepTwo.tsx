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
import {
  DeveloperConfiguration,
  FLOW
} from "../../../../lib/backend/Configuration";
import messages from "../messages";

interface IProps extends DeveloperConfiguration, InjectedIntlProps {
  onSubmit: (config: DeveloperConfiguration) => void;
}

const StepTwo = (props: IProps) => {
  const developerOptions: Option[] = [
    { value: FLOW.NEW, label: props.intl.formatMessage(messages.newDeveloper) },
    {
      value: FLOW.EXISTING,
      label: props.intl.formatMessage(messages.existingDeveloper)
    }
  ];
  return (
    <Formik
      validateOnBlur
      initialValues={{
        devEmail: props.devEmail,
        flow: props.flow,
        devPassword: props.devPassword,
        devPasswordConfirm: props.devPassword,
        key: props.key
      }}
      validationSchema={Yup.object().shape({
        devEmail: Yup.string()
          .required(props.intl.formatMessage(messages.required))
          .matches(
            /^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i,
            props.intl.formatMessage(messages.invalidEmail)
          ),
        devPassword: Yup.string().required(
          props.intl.formatMessage(messages.required)
        ),
        devPasswordConfirm: Yup.string().when("flow", {
          is: FLOW.NEW,
          then: Yup.string()
            .oneOf(
              [Yup.ref("devPassword"), null],
              props.intl.formatMessage(messages.passwordsMustMatch)
            )
            .required(props.intl.formatMessage(messages.required))
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
                      label={props.intl.formatMessage(messages.developer)}
                      options={developerOptions}
                    />
                  );
                }}
              />
            </FormControl>
            <FormControl>
              <Field
                name="devEmail"
                render={({ field, form }: FieldProps) => {
                  return (
                    <FormikInputWrapper
                      type={FieldTypes.TEXT}
                      field={field}
                      form={form}
                      label={props.intl.formatMessage(messages.email)}
                    />
                  );
                }}
              />
            </FormControl>
            <FormControl>
              <Field
                name="devPassword"
                render={({ field, form }: FieldProps) => {
                  return (
                    <FormikInputWrapper
                      type={FieldTypes.PASSWORD}
                      field={field}
                      form={form}
                      label={props.intl.formatMessage(messages.password)}
                    />
                  );
                }}
              />
            </FormControl>
            {values.flow === FLOW.NEW && (
              <FormControl>
                <Field
                  name="devPasswordConfirm"
                  render={({ field, form }: FieldProps) => {
                    return (
                      <FormikInputWrapper
                        type={FieldTypes.PASSWORD}
                        field={field}
                        form={form}
                        label={props.intl.formatMessage(messages.confirm)}
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

export default injectIntl(StepTwo);
