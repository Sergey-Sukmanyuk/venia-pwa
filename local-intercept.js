const componentsIntercept = require('./core-overrides/components/components.targetables');
const contentTypesIntercept = require('./core-overrides/ContentTypes/contentTypes.targetables');
const rootComponentsIntercept = require('./core-overrides/RootComponents/rootComponents.targetables');
const storeIntercept = require('./core-overrides/store/store.targetables');
const utilIntercept = require('./core-overrides/util/util.targetables');

function localIntercept(targets) {
    const componentsIntercept = require('./core-overrides/components/components.targetables');
    componentsIntercept(targets);

    const contentTypesIntercept = require('./core-overrides/ContentTypes/contentTypes.targetables');
    contentTypesIntercept(targets);

    const rootComponentsIntercept = require('./core-overrides/RootComponents/rootComponents.targetables');
    rootComponentsIntercept(targets);

    const storeIntercept = require('./core-overrides/store/store.targetables');
    storeIntercept(targets);

    const utilIntercept = require('./core-overrides/util/util.targetables');
    utilIntercept(targets);

    const {
        ExtendLocalIntercept
    } = require('@larsroettig/component-targetables');

    const { Targetables } = require('@magento/pwa-buildpack');
    const targetables = Targetables.using(targets);
    const extendLocalIntercept = new ExtendLocalIntercept(targetables);

    extendLocalIntercept
        .allowCustomTargetables('*.targetables.js', [
            'core-overrides/ContentTypes',
            'core-overrides/components',
            'core-overrides/RootComponents',
            'core-overrides/talons',
            'src/components',
            'src/RootComponents',
            'src/util'
        ])
        .then(() => console.log('Intercept custom JS done'));

    extendLocalIntercept
        .allowCssOverwrites('*.module.css', [
            'core-overrides/ContentTypes',
            'core-overrides/components',
            'core-overrides/RootComponents',
            'src/components',
            'src/RootComponents'
        ])
        .then(() => console.log('Intercept custom CSS done'));

    module.exports = localIntercept;
}

module.exports = localIntercept;
