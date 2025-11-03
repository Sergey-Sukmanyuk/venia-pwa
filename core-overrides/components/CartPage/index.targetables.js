const { Targetables } = require('@magento/pwa-buildpack');

module.exports = (targets) => {
    // Init targetables
    const targetables = Targetables.using(targets);

    // Init targetable component
    const cartPage = targetables.reactComponent(
        '@magento/venia-ui/lib/components/CartPage/index.js'
    );

    // Switch export instruction
    cartPage.spliceSource({
        after: "export { default } from '",
        insert: '/src/components/CartPage/cartPage.js',
        remove: './cartPage'.length
    });
};
