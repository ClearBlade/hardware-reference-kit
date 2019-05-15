import * as React from "react";
import * as ReactDOM from "react-dom";
import Typography from "@material-ui/core/Typography";
import Button from "@material-ui/core/Button";
import { FormattedMessage } from "react-intl";
import messages from "../../../../../../../../lib/frontend/home/messages";

const listStyle = {
  textAlign: "left" as "left",
  marginLeft: "auto",
  marginRight: "auto",
  width: "50%",
  listStyle: "none"
};

const WelcomeWidget: React.SFC<{}> = () => {
  return (
    <div className="text-center">
      <Typography gutterBottom variant="h2">
        ClearBlade Deployment Kit
      </Typography>
      <Typography
        gutterBottom
        variant="subtitle1"
        style={{ marginBottom: "4rem" }}
      >
        <FormattedMessage {...messages.subtitle} />
      </Typography>
      <Typography gutterBottom variant="subtitle2">
        <FormattedMessage {...messages.subtitle2} />
      </Typography>

      <Typography gutterBottom variant="overline">
        <ul style={{ ...listStyle, marginBottom: "4rem" }}>
          <li>
            - <FormattedMessage {...messages.standUpEdgePlatform} />
          </li>
          <li>
            - <FormattedMessage {...messages.createIotSolution} />
          </li>
          <li>
            - <FormattedMessage {...messages.onboardEdges} />
          </li>
          <li>
            - <FormattedMessage {...messages.buildOnTemplates} />
          </li>
          <li>
            - <FormattedMessage {...messages.createEnvironment} />
          </li>
          <li>
            - <FormattedMessage {...messages.addTheme} />
          </li>
        </ul>
      </Typography>
      <Typography gutterBottom variant="subtitle2">
        <FormattedMessage {...messages.templates} />
      </Typography>
      <Typography gutterBottom variant="overline">
        <ul style={listStyle}>
          <li>- Smart Monitoring</li>
          <li>- Anomaly Detection</li>
        </ul>
      </Typography>
      <Button
        variant="contained"
        color="primary"
        onClick={() => CB_PORTAL.selectPage("/Steps")}
        data-cy="begin"
      >
        <FormattedMessage {...messages.continue} />
      </Button>
    </div>
  );
};

const MOUNT_NODE = document.getElementById("welcome-widget");
ReactDOM.render(<WelcomeWidget />, MOUNT_NODE);
