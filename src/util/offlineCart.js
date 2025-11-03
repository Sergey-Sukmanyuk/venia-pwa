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
};

export const clearOfflineCart = () => {
    storage.removeItem(OFFLINE_CART_KEY);
};
