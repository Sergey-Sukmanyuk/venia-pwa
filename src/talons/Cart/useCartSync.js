import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppContext } from '@magento/peregrine/lib/context/app';
import { useToasts } from '@magento/peregrine/lib/Toasts';
import { useMutation, useApolloClient, gql } from '@apollo/client';
import { useCartContext } from '@magento/peregrine/lib/context/cart';
import operations from '@magento/peregrine/lib/talons/Gallery/addToCart.gql';
import {
    getOfflineCart,
    clearOfflineCart,
    removeFromOfflineCart
} from '../../util/offlineCart';

/* helper: read/write cartId to localStorage (as on your screenshot) */
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
                // not JSON
                const candidate = raw.replace(/^"|"$/g, '');
                if (candidate) return candidate;
            }
        } catch (e) {
            // localStorage inaccessible
            continue;
        }
    }
    return null;
}
function setCartIdToLocalStorage(cartId) {
    if (typeof window === 'undefined' || !window.localStorage || !cartId)
        return;
    try {
        const key = 'M2_VENIA_BROWSER_PERSISTENCE__cartId';
        const payload = {
            value: JSON.stringify(cartId),
            timeStored: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(payload));
    } catch (e) {
        // ignore
    }
}

export const useCartSync = props => {
    const { refetch, removeItem, cartId: propCartId } = props || {};

    const [{ isOnline }] = useAppContext();
    const [, { addToast }] = useToasts();

    const [{ cartId: contextCartId }, cartDispatch] = useCartContext();
    const storageCartId = getCartIdFromLocalStorage();
    // effectiveCartId is only a snapshot; we'll re-evaluate inside handleCartSync
    const effectiveCartId =
        propCartId || contextCartId || storageCartId || null;

    const [syncStatus, setSyncStatus] = useState(
        isOnline ? 'synced' : 'offline'
    );
    const prevIsOnlineRef = useRef(isOnline);
    const prevCartIdRef = useRef(effectiveCartId);
    const isSyncingRef = useRef(false);

    const [addToCart] = useMutation(operations?.ADD_ITEM);
    const apolloClient = useApolloClient();

    const CREATE_EMPTY_CART = gql`
        mutation CreateEmptyCart {
            createEmptyCart
        }
    `;

    const [createEmptyCart] = useMutation(CREATE_EMPTY_CART);

    // stock query — use no-cache to avoid writing incomplete product shape to Apollo cache
    const PRODUCT_STOCK_QUERY = gql`
        query ProductStock($sku: String!) {
            products(filter: { sku: { eq: $sku } }) {
                items {
                    sku
                    stock_status
                    name
                    __typename
                }
            }
        }
    `;

    const handleCartSync = useCallback(async () => {
        // re-evaluate storage/context at call time
        const storageCart = getCartIdFromLocalStorage();
        const currentContextCart = contextCartId;
        const cartIdFromProps = propCartId || null;
        let cartIdToUse =
            cartIdFromProps || currentContextCart || storageCart || null;

        console.info('[useCartSync] handleCartSync called', {
            isOnline,
            cartIdFromProps,
            cartIdFromContext: currentContextCart,
            cartIdFromStorage: storageCart,
            isSyncing: isSyncingRef.current
        });

        if (!isOnline) {
            console.info('[useCartSync] offline, skipping');
            return;
        }
        if (isSyncingRef.current) {
            console.info('[useCartSync] already syncing, skipping');
            return;
        }

        // if no cartId, try create guest cart
        if (!cartIdToUse) {
            try {
                console.info(
                    '[useCartSync] no cartId — calling createEmptyCart'
                );
                const res = await createEmptyCart();
                const newId = res?.data?.createEmptyCart;
                console.info(
                    '[useCartSync] createEmptyCart response',
                    res,
                    'newId:',
                    newId
                );
                if (newId) {
                    cartIdToUse = newId;
                    setCartIdToLocalStorage(newId);
                    // best-effort: dispatch to cart context — you may need to adjust action type
                    try {
                        if (typeof cartDispatch === 'function') {
                            cartDispatch({
                                type: 'CART_CREATED', // ← adapt to your reducer if needed
                                payload: { cartId: newId }
                            });
                            console.info(
                                '[useCartSync] dispatched CART_CREATED'
                            );
                        }
                    } catch (e) {
                        console.warn('[useCartSync] dispatch failed', e);
                    }
                } else {
                    console.warn(
                        '[useCartSync] createEmptyCart returned no id'
                    );
                }
            } catch (err) {
                console.warn('[useCartSync] createEmptyCart error', err);
            }
        }

        if (!cartIdToUse) {
            console.warn('[useCartSync] no cartId available — skipping sync');
            return;
        }

        isSyncingRef.current = true;
        setSyncStatus('syncing');

        try {
            const offlineItems = getOfflineCart() || [];
            console.info('[useCartSync] offlineItems', offlineItems);

            if (offlineItems.length > 0) {
                // refetch server cart only with valid cartIdToUse to avoid null-variable error
                let serverCartData = null;
                if (typeof refetch === 'function') {
                    try {
                        const refetchResult = await refetch({
                            cartId: cartIdToUse
                        });
                        serverCartData = refetchResult?.data;
                        console.info(
                            '[useCartSync] refetch result',
                            refetchResult
                        );
                    } catch (err) {
                        console.warn(
                            '[useCartSync] refetch failed (with cartId), continuing',
                            err
                        );
                    }
                } else {
                    // fallback: try apollo client query if you know the miniCart query; otherwise continue
                    console.info(
                        '[useCartSync] refetch unavailable (skipped query)'
                    );
                }

                const serverItems = serverCartData?.cart?.items || [];
                console.info('[useCartSync] server cart items', serverItems);

                const serverSkus = new Set(
                    serverItems
                        .map(i => i?.product?.sku || i?.sku)
                        .filter(Boolean)
                );
                console.info(
                    '[useCartSync] serverSkus',
                    Array.from(serverSkus)
                );

                for (const item of offlineItems) {
                    try {
                        console.info('[useCartSync] processing', item);

                        // stock check — use no-cache to prevent cache writes that expect extra key fields
                        let stockStatus = null;
                        let productName = item.name || item.sku;
                        try {
                            const { data } = await apolloClient.query({
                                query: PRODUCT_STOCK_QUERY,
                                variables: { sku: item.sku },
                                fetchPolicy: 'no-cache' // critical: avoid writing incomplete product to cache
                            });
                            console.info(
                                '[useCartSync] stock query result',
                                data
                            );
                            const found = data?.products?.items?.[0];
                            if (found) {
                                stockStatus = found.stock_status;
                                productName = found.name || productName;
                            }
                        } catch (err) {
                            console.warn(
                                '[useCartSync] stock query failed',
                                err
                            );
                        }

                        if (
                            stockStatus &&
                            `${stockStatus}`.toUpperCase() === 'OUT_OF_STOCK'
                        ) {
                            removeFromOfflineCart(item.sku);
                            window.dispatchEvent(
                                new Event('offlineCartChanged')
                            );
                            addToast({
                                type: 'error',
                                message: `${productName} (${
                                    item.sku
                                }) removed — out of stock.`,
                                timeout: 6000
                            });
                            continue;
                        }

                        if (serverSkus.has(item.sku)) {
                            removeFromOfflineCart(item.sku);
                            window.dispatchEvent(
                                new Event('offlineCartChanged')
                            );
                            continue;
                        }

                        console.info(
                            `[useCartSync] adding ${item.sku} qty ${
                                item.quantity
                            } to cart ${cartIdToUse}`
                        );
                        let addResult = null;
                        try {
                            const resp = await addToCart({
                                variables: {
                                    cartId: cartIdToUse,
                                    cartItem: {
                                        sku: item.sku,
                                        quantity: item.quantity
                                    }
                                }
                            });
                            addResult = resp;
                            console.info(
                                '[useCartSync] addToCart response',
                                resp
                            );
                        } catch (err) {
                            console.warn('[useCartSync] addToCart error', err);
                        }

                        const success = !!addResult?.data;
                        if (success) {
                            removeFromOfflineCart(item.sku);
                            window.dispatchEvent(
                                new Event('offlineCartChanged')
                            );
                            serverSkus.add(item.sku);
                        } else {
                            console.warn(
                                '[useCartSync] add not confirmed for',
                                item.sku
                            );
                        }
                    } catch (err) {
                        console.warn('[useCartSync] processing error', err);
                    }
                }

                const remaining = getOfflineCart();
                console.info(
                    '[useCartSync] remaining offline items',
                    remaining
                );
                if (!remaining || remaining.length === 0) {
                    clearOfflineCart();
                    window.dispatchEvent(new Event('offlineCartChanged'));
                }

                addToast({
                    type: 'info',
                    message: 'Offline items synchronized successfully.',
                    timeout: 4000
                });
            }

            // final refetch to update UI — call with cartIdToUse
            if (typeof refetch === 'function') {
                try {
                    await refetch({ cartId: cartIdToUse });
                } catch (err) {
                    console.warn('[useCartSync] final refetch failed', err);
                }
            }
            setSyncStatus('synced');
        } catch (err) {
            console.error('[useCartSync] sync failed', err);
            setSyncStatus('synced');
            addToast({
                type: 'error',
                message: 'Error during cart sync. Check network/console.',
                timeout: 5000
            });
        } finally {
            isSyncingRef.current = false;
        }
    }, [
        isOnline,
        propCartId,
        contextCartId,
        refetch,
        addToCart,
        addToast,
        apolloClient,
        createEmptyCart,
        cartDispatch
    ]);

    useEffect(() => {
        const currentEffective =
            propCartId || contextCartId || getCartIdFromLocalStorage() || null;
        console.info('[useCartSync] effect', {
            isOnline,
            effectiveCartId: currentEffective,
            prevIsOnline: prevIsOnlineRef.current,
            prevCartId: prevCartIdRef.current
        });

        if (!isOnline) {
            setSyncStatus('offline');
        } else if (isOnline && !prevIsOnlineRef.current) {
            handleCartSync();
        }
        if (isOnline && !prevCartIdRef.current && currentEffective) {
            console.info(
                '[useCartSync] cartId appeared while online — triggering sync',
                { cartId: currentEffective }
            );
            handleCartSync();
        }

        prevIsOnlineRef.current = isOnline;
        prevCartIdRef.current = currentEffective;
    }, [isOnline, propCartId, contextCartId, handleCartSync]);

    // manual trigger for debug
    useEffect(() => {
        try {
            if (typeof window !== 'undefined')
                window.__triggerCartSync = handleCartSync;
        } catch (e) {}
        return () => {
            try {
                if (
                    typeof window !== 'undefined' &&
                    window.__triggerCartSync === handleCartSync
                )
                    delete window.__triggerCartSync;
            } catch (e) {}
        };
    }, [handleCartSync]);

    return { syncStatus, isSyncing: syncStatus === 'syncing' };
};

export default useCartSync;
