import noDoubleCast from "./rules/no-double-cast.js";
import noPlaceholderThrow from "./rules/no-placeholder-throw.js";
import noRawWebsocketSend from "./rules/no-raw-websocket-send.js";

const plugin = {
	meta: {
		name: "eslint-plugin-lb",
		version: "0.1.0",
	},
	rules: {
		"no-placeholder-throw": noPlaceholderThrow,
		"no-double-cast": noDoubleCast,
		"no-raw-websocket-send": noRawWebsocketSend,
	},
};

export default plugin;
