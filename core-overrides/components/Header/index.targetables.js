const { Targetables } = require('@magento/pwa-buildpack');

module.exports = (targets) => {
    // Init targetables
    const targetables = Targetables.using(targets);

    // Init targetable component
    const header = targetables.reactComponent(
        '@magento/venia-ui/lib/components/Header/header.js'
    );

    // Switch export instruction
    header.spliceSource({
        after: "import CartTrigger from '",
        insert: '/src/components/Header/cartTrigger.js',
        remove: './cartTrigger'.length
    });
};
