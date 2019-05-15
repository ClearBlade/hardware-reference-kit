// ***********************************************************
// This example support/index.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import "./commands";

const CDK_PORTAL_URL_MAP = {
  test: "http://localhost:3000/provision",
  local:
    "http://localhost:3000/portal/?systemKey=AAAAAAAAAAAAAAAAAAAAAJkuQPkk229J4tADDI52-1s4H5JeHPr7MIFrGK8=&systemSecret=AAAAAAAAAAAAAAAAAAAAAFk3tLm1IfxgafDtjFKr9PLgMuTHC1MCsBtnGDs=&name=provision&allowAnon=true"
};

export const CDK_PORTAL_URL =
  CDK_PORTAL_URL_MAP[Cypress.env("TARGET") || "test"] || Cypress.env("TARGET");
