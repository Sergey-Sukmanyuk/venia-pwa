/* eslint-disable */

const CartPage = require('./CartPage/index.targetables');
const Item = require('./Gallery/item.targetables');
const Header = require('./Header/index.targetables');
const ProductFullDetail = require('./ProductFullDetail/productFullDetail.targetables.js');

function componentsIntercept(targets) {
    const CartPage = require('./CartPage/index.targetables');
    CartPage(targets);

    const Item = require('./Gallery/item.targetables.js');
    Item(targets);

    const Header = require('./Header/index.targetables.js');
    Header(targets);

    const ProductFullDetail = require('./ProductFullDetail/productFullDetail.targetables.js');
    ProductFullDetail(targets);
}

module.exports = componentsIntercept;
