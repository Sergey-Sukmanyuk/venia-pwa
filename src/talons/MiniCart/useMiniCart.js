import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useQuery, useMutation } from '@apollo/client';

import { useCartContext } from '@magento/peregrine/lib/context/cart';
import { deriveErrorMessage } from '@magento/peregrine/lib/util/deriveErrorMessage';
import mergeOperations from '@magento/peregrine/lib/util/shallowMerge';
import DEFAULT_OPERATIONS from '@magento/peregrine/lib/talons/MiniCart/miniCart.gql.js';
import { useEventingContext } from '@magento/peregrine/lib/context/eventing';
import { useCartSync } from '../Cart/useCartSync';
import { getOfflineCart, removeFromOfflineCart } from '../../util/offlineCart';
import { useAppContext } from '@magento/peregrine/lib/context/app';

function getCartIdFromLocalStorage() {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const keys = [
        'M2_VENIA_BROWSER_PERSISTENCE__cartId',
        'M2_VENIA_BROWSER_PERSISTENCE__cart_id',
        'm2_venia_browser_persistence__cartId'
    ];
    for (const key of keys) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            try {
                const obj = JSON.parse(raw);
                if (
                    obj &&
                    typeof obj === 'object' &&
                    obj.value !== undefined &&
                    obj.value !== null
                ) {
                    try {
                        const inner = JSON.parse(obj.value);
                        if (typeof inner === 'string' && inner.length)
                            return inner;
                    } catch (e) {
                        if (typeof obj.value === 'string' && obj.value.length)
                            return obj.value.replace(/^"|"$/g, '');
                    }
                }
            } catch (e) {
                const candidate = raw.replace(/^"|"$/g, '');
                if (candidate) return candidate;
            }
        } catch (e) {
            continue;
        }
    }
    return null;
}

export const useMiniCart = props => {
    const { isOpen, setIsOpen } = props;

    const [, { dispatch }] = useEventingContext();

    const operations = mergeOperations(DEFAULT_OPERATIONS, props.operations);
    const {
        removeItemMutation,
        miniCartQuery,
        getStoreConfigQuery
    } = operations;

    const [{ cartId }] = useCartContext();
    const [{ isOnline }] = useAppContext();

    const history = useHistory();

    const {
        data: miniCartData,
        loading: miniCartLoading,
        refetch: refetchMiniCart
    } = useQuery(miniCartQuery, {
        fetchPolicy: 'cache-and-network',
        nextFetchPolicy: 'cache-first',
        variables: { cartId },
        skip: !cartId,
        errorPolicy: 'all'
    });

    const { data: storeConfigData } = useQuery(getStoreConfigQuery, {
        fetchPolicy: 'cache-and-network',
        nextFetchPolicy: 'cache-first'
    });

    const configurableThumbnailSource = useMemo(() => {
        if (storeConfigData) {
            return storeConfigData.storeConfig.configurable_thumbnail_source;
        }
    }, [storeConfigData]);

    const storeUrlSuffix = useMemo(() => {
        if (storeConfigData) {
            return storeConfigData.storeConfig.product_url_suffix;
        }
    }, [storeConfigData]);

    const [
        removeItem,
        {
            loading: removeItemLoading,
            called: removeItemCalled,
            error: removeItemError
        }
    ] = useMutation(removeItemMutation);

    const { syncStatus, isSyncing } = useCartSync({
        refetch: refetchMiniCart,
        removeItem,
        cartId
    });

    const [offlineItems, setOfflineItems] = useState(() => getOfflineCart());

    // serverItems: fallback storage-driven refetch result (used when context cartId is not available)
    const [serverItems, setServerItems] = useState(undefined);

    useEffect(() => {
        const update = () => {
            setOfflineItems(getOfflineCart());
        };

        window.addEventListener('offlineCartChanged', update);
        window.addEventListener('storage', update);

        return () => {
            window.removeEventListener('offlineCartChanged', update);
            window.removeEventListener('storage', update);
        };
    }, []);

    useEffect(() => {
        let mounted = true;

        const tryRefetchFromStorage = async () => {
            try {
                const storageCartId = getCartIdFromLocalStorage();
                console.info('[useMiniCart] tryRefetchFromStorage', {
                    isOnline,
                    contextCartId: cartId,
                    storageCartId
                });
                if (!isOnline) return;
                if (!storageCartId) return;
                // If context already has cartId, prefer the normal query flow (it will update miniCartData)
                if (cartId) return;

                if (typeof refetchMiniCart === 'function') {
                    try {
                        const res = await refetchMiniCart({
                            cartId: storageCartId
                        });
                        const items = res?.data?.cart?.items;
                        if (mounted) {
                            if (items && items.length) {
                                setServerItems(items);
                            } else {
                                setServerItems([]);
                            }
                        }
                    } catch (err) {
                        console.warn(
                            '[useMiniCart] refetchMiniCart from storage failed',
                            err
                        );
                    }
                } else {
                    console.info(
                        '[useMiniCart] refetchMiniCart not available to call'
                    );
                }
            } catch (e) {
                console.warn('[useMiniCart] tryRefetchFromStorage error', e);
            }
        };

        // run once immediately
        tryRefetchFromStorage();

        // Listen for updates that may add cartId to storage or change offline cart
        window.addEventListener('storage', tryRefetchFromStorage);
        window.addEventListener('offlineCartChanged', tryRefetchFromStorage);

        return () => {
            mounted = false;
            window.removeEventListener('storage', tryRefetchFromStorage);
            window.removeEventListener(
                'offlineCartChanged',
                tryRefetchFromStorage
            );
        };
    }, [isOnline, cartId, refetchMiniCart]);

    // Helper: map offline item structure to the shape Minicart expects
    const mapOfflineToCartItem = offlineItem => {
        return {
            uid: `offline-${offlineItem.sku}-${Math.random()
                .toString(36)
                .substr(2, 9)}`,
            product: {
                uid: `offline-product-${offlineItem.sku}`,
                name: offlineItem.name,
                sku: offlineItem.sku,
                url_key: offlineItem.url_key || '',
                thumbnail: {
                    url: offlineItem.thumbnailUrl || ''
                },
                stock_status: 'IN_STOCK'
            },
            prices: {
                price: {
                    currency: offlineItem.currency || 'USD',
                    value: offlineItem.price || 0
                },
                total_item_discount: {
                    value: 0
                }
            },
            quantity: offlineItem.quantity || 1
        };
    };

    const productList = useMemo(() => {
        if (!isOnline) {
            return offlineItems.map(mapOfflineToCartItem);
        }

        if (!miniCartLoading && miniCartData?.cart?.items) {
            return miniCartData.cart.items;
        }

        if (typeof serverItems !== 'undefined') {
            return serverItems;
        }

        // otherwise wait
        return undefined;
    }, [miniCartData, miniCartLoading, isOnline, offlineItems, serverItems]);

    const totalQuantity = useMemo(() => {
        if (!isOnline) {
            return offlineItems.reduce(
                (sum, it) => sum + (it.quantity || 0),
                0
            );
        }
        if (
            !miniCartLoading &&
            miniCartData?.cart?.total_quantity !== undefined
        ) {
            return miniCartData.cart.total_quantity;
        }
        if (Array.isArray(serverItems)) {
            return serverItems.reduce((sum, it) => sum + (it.quantity || 0), 0);
        }
        return undefined;
    }, [miniCartData, miniCartLoading, isOnline, offlineItems, serverItems]);

    const subTotal = useMemo(() => {
        if (!isOnline) {
            const total = offlineItems.reduce((sum, it) => {
                const price = it.price || 0;
                return sum + price * (it.quantity || 1);
            }, 0);
            return {
                currency: offlineItems[0]?.currency || 'USD',
                value: total
            };
        }
        if (
            !miniCartLoading &&
            miniCartData?.cart?.prices?.subtotal_excluding_tax
        ) {
            return miniCartData.cart.prices.subtotal_excluding_tax;
        }
        if (Array.isArray(serverItems) && serverItems.length) {
            const total = serverItems.reduce((sum, it) => {
                const price =
                    (it.prices && it.prices.price && it.prices.price.value) ||
                    0;
                return sum + price * (it.quantity || 1);
            }, 0);
            return {
                currency: serverItems[0]?.prices?.price?.currency || 'USD',
                value: total
            };
        }
        return undefined;
    }, [miniCartData, miniCartLoading, isOnline, offlineItems, serverItems]);

    const closeMiniCart = useCallback(() => {
        setIsOpen(false);
    }, [setIsOpen]);

    const handleRemoveItem = useCallback(
        async id => {
            try {
                // If offline and item has offline uid, remove from offline storage
                if (!isOnline && `${id}`.startsWith('offline-')) {
                    // extract sku from uid pattern offline-<sku>-<random>
                    const maybeSku = `${id}`.split('-')[1];
                    removeFromOfflineCart(maybeSku);
                    // update local state immediately
                    setOfflineItems(getOfflineCart());
                    dispatch({
                        type: 'CART_REMOVE_ITEM',
                        payload: { uid: id }
                    });
                    return;
                }

                // Use effective cartId: prefer context, fallback to storage
                const effectiveCartId = cartId || getCartIdFromLocalStorage();

                if (!effectiveCartId) {
                    console.warn(
                        '[useMiniCart] removeItem: no cartId available'
                    );
                    return;
                }

                // perform server removal
                const resp = await removeItem({
                    variables: {
                        cartId: effectiveCartId,
                        itemId: id
                    }
                });

                // After successful removal, try to refresh mini cart UI:
                // 1) If the normal query is active, refetchMiniCart will update miniCartData.
                // 2) If we used serverItems fallback (query was skipped), update serverItems from refetch result or filter locally.
                try {
                    if (typeof refetchMiniCart === 'function') {
                        const refetchRes = await refetchMiniCart({
                            cartId: effectiveCartId
                        });
                        // if refetch returned items, update serverItems accordingly
                        const items = refetchRes?.data?.cart?.items;
                        if (Array.isArray(items)) {
                            setServerItems(items);
                        } else {
                            // fallback: remove locally by uid if possible
                            setServerItems(prev =>
                                Array.isArray(prev)
                                    ? prev.filter(it => it.uid !== id)
                                    : prev
                            );
                        }
                    } else {
                        // no refetch available — optimistically remove from local serverItems
                        setServerItems(prev =>
                            Array.isArray(prev)
                                ? prev.filter(it => it.uid !== id)
                                : prev
                        );
                    }
                } catch (e) {
                    console.warn(
                        '[useMiniCart] post-remove refetch/update failed',
                        e
                    );
                    // best-effort: still remove locally
                    setServerItems(prev =>
                        Array.isArray(prev)
                            ? prev.filter(it => it.uid !== id)
                            : prev
                    );
                }
            } catch (err) {
                console.error('Failed to remove item', err);
            }
        },
        // include refetchMiniCart in deps so callback updates when refetch changes
        [isOnline, removeItem, cartId, dispatch, refetchMiniCart]
    );

    const derivedErrorMessage = useMemo(
        () => deriveErrorMessage([removeItemError]),
        [removeItemError]
    );

    useEffect(() => {
        if (isOpen) {
            dispatch({
                type: 'MINI_CART_VIEW',
                payload: {
                    cartId: cartId,
                    products: productList
                }
            });
        }
    }, [isOpen, cartId, productList, dispatch]);

    return {
        closeMiniCart,
        errorMessage: derivedErrorMessage,
        handleEditCart: () => {
            setIsOpen(false);
            history.push('/cart');
        },
        handleProceedToCheckout: () => {
            setIsOpen(false);
            history.push('/checkout');
        },
        handleRemoveItem,
        loading: miniCartLoading || (removeItemCalled && removeItemLoading),
        productList,
        subTotal,
        totalQuantity,
        configurableThumbnailSource,
        storeUrlSuffix,
        syncStatus,
        isSyncing
    };
};
export default useMiniCart;
