import * as React from "react";
import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import DialogTitle from "@material-ui/core/DialogTitle";
import withMobileDialog, {
  InjectedProps
} from "@material-ui/core/withMobileDialog";
import { FormattedMessage } from "react-intl";

interface IProps extends InjectedProps {
  headerMsg: FormattedMessage.MessageDescriptor;
  bodyText: string;
  onClose: () => void;
}

class ResponsiveDialog extends React.PureComponent<IProps, {}> {
  handleClose = () => {
    this.props.onClose();
  };

  render() {
    const { fullScreen, headerMsg, bodyText } = this.props;

    return (
      <div>
        <Dialog
          fullScreen={fullScreen}
          open={true}
          onClose={this.handleClose}
          aria-labelledby="responsive-dialog-title"
        >
          <DialogTitle id="responsive-dialog-title">
            <FormattedMessage {...headerMsg} />
          </DialogTitle>
          <DialogContent>
            <DialogContentText>{bodyText}</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={this.handleClose} color="primary" autoFocus>
              Okay
            </Button>
          </DialogActions>
        </Dialog>
      </div>
    );
  }
}

export default withMobileDialog()(ResponsiveDialog) as React.ComponentType<
  IProps
>;
