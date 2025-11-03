/* eslint-disable */
const cartAsyncActions = require("./actions/cart/asyncActions.targetables");

function storeIntercept(targets) {
    const cartAsyncActions = require('./actions/cart/asyncActions.targetables');
    cartAsyncActions(targets);

}

module.exports = storeIntercept;
