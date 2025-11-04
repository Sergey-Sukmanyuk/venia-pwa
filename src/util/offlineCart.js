import BrowserPersistence from '@magento/peregrine/lib/util/simplePersistence';

const storage = new BrowserPersistence();

const OFFLINE_CART_KEY = 'offlineCartItems';

export const getOfflineCart = () => {
    return storage.getItem(OFFLINE_CART_KEY) || [];
};

export const addToOfflineCart = item => {
    const existingItems = getOfflineCart();

    const existing = existingItems.find(i => i.sku === item.sku);
    if (existing) {
        existing.quantity += item.quantity || 1;
    } else {
        existingItems.push(item);
    }

    storage.setItem(OFFLINE_CART_KEY, existingItems);

    // Notify in-tab listeners that offline cart changed.
    try {
        window.dispatchEvent(new Event('offlineCartChanged'));
    } catch (e) {
        // graceful fallback for environments without window
        /* no-op */
    }
};

export const removeFromOfflineCart = skuOrPredicate => {
    const existingItems = getOfflineCart();
    const remaining = existingItems.filter(it => {
        if (typeof skuOrPredicate === 'function') {
            return !skuOrPredicate(it);
        }
        return it.sku !== skuOrPredicate;
    });

    storage.setItem(OFFLINE_CART_KEY, remaining);

    try {
        window.dispatchEvent(new Event('offlineCartChanged'));
    } catch (e) {
        /* no-op */
    }

    return remaining;
};

export const clearOfflineCart = () => {
    storage.removeItem(OFFLINE_CART_KEY);
    try {
        window.dispatchEvent(new Event('offlineCartChanged'));
    } catch (e) {
        /* no-op */
    }
};
