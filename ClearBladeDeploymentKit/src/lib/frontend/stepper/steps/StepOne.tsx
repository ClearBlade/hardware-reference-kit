import * as React from "react";
import { Formik, Form, Field, FieldProps } from "formik";
import FormControl from "@material-ui/core/FormControl";
import FormGroup from "@material-ui/core/FormGroup";
import Button from "@material-ui/core/Button";
import { injectIntl, InjectedIntlProps } from "react-intl";
import * as Yup from "yup";

import messages from "../messages";
import {
  PlatformConfiguration,
  FLOW
} from "../../../../lib/backend/Configuration";
import FormikInputWrapper, {
  FieldTypes,
  Option
} from "../../../../lib/frontend/FormikInputWrapper";

const platformOptions: Option<FLOW>[] = [
  { value: FLOW.PRECONFIGURED, label: "pre" },
  { value: FLOW.EXISTING, label: "eexist" }
];

interface IProps extends PlatformConfiguration, InjectedIntlProps {
  onSubmit: (config: PlatformConfiguration) => void;
}

const StepOne = (props: IProps) => {
  return (
    <Formik
      validateOnBlur
      initialValues={{ platformURL: props.platformURL, flow: props.flow }}
      validationSchema={Yup.object().shape({
        platformURL: Yup.string()
          .required(props.intl.formatMessage(messages.required))
          // todo: make this work with IPs
          .matches(
            /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/,
            props.intl.formatMessage(messages.invalidUrl)
          )
      })}
      onSubmit={values => {
        props.onSubmit(values);
      }}
    >
      {({ handleSubmit }) => (
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
                      label={props.intl.formatMessage(messages.platform)}
                      options={platformOptions}
                    />
                  );
                }}
              />
            </FormControl>
            <FormControl>
              <Field
                name="platformURL"
                render={({ field, form }: FieldProps) => {
                  return (
                    <FormikInputWrapper
                      type={FieldTypes.TEXT}
                      field={field}
                      form={form}
                      label={props.intl.formatMessage(messages.platformURL)}
                    />
                  );
                }}
              />
            </FormControl>
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

export default injectIntl(StepOne);
