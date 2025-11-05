import { useCallback, useEffect, useMemo } from 'react';
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
    const history = useHistory();

    const { data: miniCartData, loading: miniCartLoading } = useQuery(
        miniCartQuery,
        {
            fetchPolicy: 'cache-and-network',
            nextFetchPolicy: 'cache-first',
            variables: { cartId },
            skip: !cartId,
            errorPolicy: 'all'
        }
    );

    const { data: storeConfigData } = useQuery(getStoreConfigQuery, {
        fetchPolicy: 'cache-and-network'
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

    const totalQuantity = useMemo(() => {
        if (!miniCartLoading) {
            return miniCartData?.cart?.total_quantity;
        }
    }, [miniCartData, miniCartLoading]);

    const subTotal = useMemo(() => {
        if (!miniCartLoading) {
            return miniCartData?.cart?.prices?.subtotal_excluding_tax;
        }
    }, [miniCartData, miniCartLoading]);

    const productList = useMemo(() => {
        if (!miniCartLoading) {
            return miniCartData?.cart?.items;
        }
    }, [miniCartData, miniCartLoading]);

    const closeMiniCart = useCallback(() => {
        setIsOpen(false);
    }, [setIsOpen]);

    const handleRemoveItem = useCallback(
        async id => {
            try {
                await removeItem({
                    variables: {
                        cartId,
                        itemId: id
                    }
                });

                const [product] = productList.filter(
                    p => (p.uid || p.id) === id
                );

                const selectedOptionsLabels =
                    product.configurable_options?.map(
                        ({ option_label, value_label }) => ({
                            attribute: option_label,
                            value: value_label
                        })
                    ) || null;

                dispatch({
                    type: 'CART_REMOVE_ITEM',
                    payload: {
                        cartId,
                        sku: product.product.sku,
                        name: product.product.name,
                        priceTotal: product.prices.price.value,
                        currencyCode: product.prices.price.currency,
                        discountAmount:
                            product.prices.total_item_discount.value,
                        selectedOptions: selectedOptionsLabels,
                        quantity: product.quantity
                    }
                });
            } catch (e) {
                // Error is logged by apollo link - no need to double log.
            }
        },
        [removeItem, cartId, dispatch, productList]
    );

    const handleProceedToCheckout = useCallback(() => {
        setIsOpen(false);
        history.push('/checkout');
    }, [history, setIsOpen]);

    const handleEditCart = useCallback(() => {
        setIsOpen(false);
        history.push('/cart');
    }, [history, setIsOpen]);

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
        handleEditCart,
        handleProceedToCheckout,
        handleRemoveItem,
        loading: miniCartLoading || (removeItemCalled && removeItemLoading),
        productList,
        subTotal,
        totalQuantity,
        configurableThumbnailSource,
        storeUrlSuffix
    };
};
