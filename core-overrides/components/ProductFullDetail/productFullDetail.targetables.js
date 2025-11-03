const { Targetables } = require('@magento/pwa-buildpack');

module.exports = (targets) => {
    // Init targetables
    const targetables = Targetables.using(targets);

    // Init targetable component
    const productFullDetail = targetables.reactComponent(
        '@magento/venia-ui/lib/components/ProductFullDetail/productFullDetail.js'
    );

    // Switch export instruction
    productFullDetail.spliceSource({
        after: "import { useProductFullDetail } from '",
        insert: '/src/talons/ProductFullDetail/useProductFullDetail.js',
        remove: '@magento/peregrine/lib/talons/ProductFullDetail/useProductFullDetail'
            .length
    });
};
