import * as React from "react";
import { FieldProps } from "formik";
import TextField from "@material-ui/core/TextField";
import RadioGroup from "@material-ui/core/RadioGroup";
import Radio from "@material-ui/core/Radio";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import FormLabel from "@material-ui/core/FormLabel";
import Select from "@material-ui/core/Select";

export enum FieldTypes {
  TEXT,
  PASSWORD,
  RADIO_GROUP,
  SELECT
}

export interface Option<T = any> {
  value: T;
  label: string;
}

type IProps<T extends FieldTypes> = {
  type: T;
  label: string;
  inputProps?: { "data-cy"?: string };
} & FieldProps &
  (T extends FieldTypes.RADIO_GROUP | FieldTypes.SELECT
    ? {
        options: Option[];
      }
    : {});

function FormikInputWrapper<T extends FieldTypes>(props: IProps<T>) {
  const {
    type,
    field,
    form: { touched, errors },
    label,
    inputProps = {}
  } = props;
  const fieldTouched = touched[field.name];
  const fieldError = errors[field.name];
  switch (type) {
    case FieldTypes.TEXT:
    case FieldTypes.PASSWORD:
      return (
        <TextField
          {...field}
          inputProps={inputProps}
          error={fieldTouched && fieldError ? true : false}
          helperText={fieldTouched && fieldError}
          label={label}
          margin="normal"
          type={type === FieldTypes.PASSWORD ? "password" : "text"}
        />
      );
    case FieldTypes.RADIO_GROUP: {
      const options = (props as IProps<FieldTypes.RADIO_GROUP>).options;
      return (
        <RadioGroup {...field} data-cy={inputProps["data-cy"]}>
          <FormLabel component="legend">{label}</FormLabel>
          {options.map(o => (
            <FormControlLabel
              key={o.value}
              value={o.value}
              control={<Radio />}
              label={o.label}
              data-cy={`option-${o.value}`}
            />
          ))}
        </RadioGroup>
      );
    }
    case FieldTypes.SELECT: {
      const options = (props as IProps<FieldTypes.SELECT>).options;
      return (
        <Select native {...field} inputProps={inputProps}>
          {options.map(o => (
            <option key={`option-${JSON.stringify(o.value)}`} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    }
  }
  return null;
}

export default FormikInputWrapper;
