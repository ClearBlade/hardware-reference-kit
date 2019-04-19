import * as React from "react";
import { Formik, Form, Field, ErrorMessage, FieldProps } from "formik";
import { IStepProps } from "./shared";
import TextField from "@material-ui/core/TextField";
import { injectIntl, InjectedIntlProps } from "react-intl";
import * as Yup from "yup";

import messages from "../messages";

interface IProps extends IStepProps, InjectedIntlProps {}

const StepOne = (props: IProps) => {
  console.log("step one");
  return (
    <Formik
      validateOnBlur
      initialValues={{ email: "", password: "" }}
      validationSchema={Yup.object().shape({
        email: Yup.string()
          .required(props.intl.formatMessage(messages.required))
          .matches(
            /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/,
            props.intl.formatMessage(messages.invalidUrl)
          )
      })}
      onSubmit={(values, { setSubmitting }) => {
        setTimeout(() => {
          setSubmitting(false);
          props.onComplete();
        }, 400);
      }}
    >
      {({ errors }) => (
        <Form>
          <Field
            name="email"
            render={({
              field,
              form: { touched, error, errors }
            }: FieldProps) => {
              return (
                <TextField
                  {...field}
                  error={touched.email && errors.email ? true : false}
                  helperText={touched.email && errors.email}
                  label={props.intl.formatMessage(messages.platformURL)}
                  margin="normal"
                />
              );
            }}
          />
        </Form>
      )}
    </Formik>
  );
};

export default injectIntl(StepOne);
