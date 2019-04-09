import "@babel/polyfill";

function waitForMe() {
  return new Promise(resolve => {
    resolve("sup");
  });
}

function testPromise(req: CbServer.BasicReq, resp: CbServer.Resp) {
  waitForMe().then(data => {
    resp.success(data);
  });
}

// @ts-ignore
global.testPromise = testPromise;
