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

    // State with offline items and subscription to changes
    const [offlineItems, setOfflineItems] = useState(() => getOfflineCart());

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
        if (!miniCartLoading) {
            return miniCartData?.cart?.items;
        }
        return undefined;
    }, [miniCartData, miniCartLoading, isOnline, offlineItems]);

    const totalQuantity = useMemo(() => {
        if (!isOnline) {
            return offlineItems.reduce(
                (sum, it) => sum + (it.quantity || 0),
                0
            );
        }
        if (!miniCartLoading) {
            return miniCartData?.cart?.total_quantity;
        }
        return undefined;
    }, [miniCartData, miniCartLoading, isOnline, offlineItems]);

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
        if (!miniCartLoading) {
            return miniCartData?.cart?.prices?.subtotal_excluding_tax;
        }
        return undefined;
    }, [miniCartData, miniCartLoading, isOnline, offlineItems]);

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

                await removeItem({
                    variables: {
                        cartId,
                        itemId: id
                    }
                });
            } catch (err) {
                console.error('Failed to remove item', err);
            }
        },
        [isOnline, removeItem, cartId, dispatch]
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
