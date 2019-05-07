import * as React from "react";
import * as ReactDOM from "react-dom";
import Typography from "@material-ui/core/Typography";

const WelcomeWidget: React.SFC<{}> = () => {
  return (
    <div className="text-center">
      <Typography gutterBottom variant="h2">
        ClearBlade Deployment Kit
      </Typography>
      <Typography gutterBottom variant="subtitle1">
        Interactive kit to accelerate edge deployments for new and existing IoT
        Solutions.
      </Typography>
      <Typography gutterBottom variant="subtitle2">
        This kit walks you through the steps to accomplish the following
        deployment tasks:
      </Typography>

      <Typography gutterBottom variant="overline">
        <ul
          style={{
            textAlign: "left",
            marginLeft: "auto",
            marginRight: "auto",
            width: "50%",
            listStyle: "none"
          }}
        >
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
    </div>
  );
};

const MOUNT_NODE = document.getElementById("welcome-widget");
ReactDOM.render(<WelcomeWidget />, MOUNT_NODE);
