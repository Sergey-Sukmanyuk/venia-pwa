const { Targetables } = require('@magento/pwa-buildpack');

module.exports = (targets) => {
    // Init targetables
    const targetables = Targetables.using(targets);

    // Init targetable component
    const item = targetables.reactComponent(
        '@magento/venia-ui/lib/components/Gallery/item.js'
    );

    // Switch export instruction
    item.spliceSource({
        after: "import AddToCartButton from '",
        insert: '/src/components/Gallery/addToCartButton.js',
        remove: './addToCartButton'.length
    });
};
