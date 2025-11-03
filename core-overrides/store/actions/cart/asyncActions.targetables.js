const { Targetables } = require('@magento/pwa-buildpack');

module.exports = (targets) => {
    // Init targetables
    const targetables = Targetables.using(targets);

    // Init targetable component
    const cartAsyncActions = targetables.reactComponent(
        '@magento/peregrine/lib/store/actions/cart/asyncActions.js'
    );

    // Add permanent card functions back
    cartAsyncActions.spliceSource({
        before: 'export const addItemToCart = (payload = {}) => {',
        insert: "export const restoreCart = () =>\n" +
            "    async function thunk(dispatch) {\n" +
            "        // if a permanent cart exists in storage, act like we just received it\n" +
            "        const permanentCartId = await retrievePermanentCartId();\n" +
            "        console.log('restoring');\n" +
            "        if (permanentCartId) {\n" +
            "            dispatch(actions.getCart.receive(permanentCartId));\n" +
            "            saveCartId(permanentCartId);\n" +
            "            clearPermanentCartId();\n" +
            "        }\n" +
            "    };\n"
    });

    cartAsyncActions.spliceSource({
        before: 'export async function saveCartId(id) {',
        insert: "export async function retrievePermanentCartId() {\n" +
            "    return storage.getItem('permanentCartId');\n" +
            "}\n" +
            "export async function savePermanentCartId(id) {\n" +
            "    return storage.getItem('permanentCartId', id);\n" +
            "}\n"
    });

    cartAsyncActions.spliceSource({
        before: 'export async function clearCartId() {',
        insert: "export async function clearPermanentCartId() {\n" +
            "    return storage.removeItem('permanentCartId');\n" +
            "}\n"
    });
};
