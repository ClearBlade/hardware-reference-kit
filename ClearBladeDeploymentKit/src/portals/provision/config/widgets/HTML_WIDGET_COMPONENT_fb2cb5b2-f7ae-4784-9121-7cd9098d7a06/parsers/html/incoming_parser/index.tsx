import * as React from "react";
import * as ReactDOM from "react-dom";
import Typography from "@material-ui/core/Typography";

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
        Interactive kit to accelerate edge deployments for new and existing IoT
        Solutions.
      </Typography>
      <Typography gutterBottom variant="subtitle2">
        This kit walks you through the steps to accomplish the following
        deployment tasks:
      </Typography>

      <Typography gutterBottom variant="overline">
        <ul style={{ ...listStyle, marginBottom: "4rem" }}>
          <li>- Stand up a new Edge Platform</li>
          <li>
            - Create an IoT Solution manageable from cloud with an active
            connection to this gateway
          </li>
          <li>- Onboard edges at scale to existing IoT Solutions</li>
          <li>- Build upon fully-featured IoT Solution Templates</li>
          <li>- Create a new development environment or connect to existing</li>
          <li>- Add Theme and Preconfigure for out-of-box experiences</li>
        </ul>
      </Typography>
      <Typography gutterBottom variant="subtitle2">
        Templates:
      </Typography>
      <Typography gutterBottom variant="overline">
        <ul style={listStyle}>
          <li>- Smart Monitoring</li>
          <li>- Anomaly Detection</li>
        </ul>
      </Typography>
    </div>
  );
};

const MOUNT_NODE = document.getElementById("welcome-widget");
ReactDOM.render(<WelcomeWidget />, MOUNT_NODE);
