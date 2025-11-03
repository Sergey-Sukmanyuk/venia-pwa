import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLazyQuery, useMutation } from '@apollo/client';

import { useCartContext } from '@magento/peregrine/lib/context/cart';
import mergeOperations from '@magento/peregrine/lib/util/shallowMerge';
import DEFAULT_OPERATIONS from './cartPage.gql';
import { useEventingContext } from '@magento/peregrine/lib/context/eventing';
import { useCartSync } from '../Cart/useCartSync';

export const useCartPage = (props = {}) => {
    const operations = mergeOperations(DEFAULT_OPERATIONS, props.operations);
    const { getCartDetailsQuery, removeItemMutation } = operations;

    const [{ cartId }] = useCartContext();

    const [isCartUpdating, setIsCartUpdating] = useState(false);
    const [wishlistSuccessProps, setWishlistSuccessProps] = useState(null);
    const [removeItem] = useMutation(removeItemMutation);

    const [fetchCartDetails, { called, data, loading }] = useLazyQuery(
        getCartDetailsQuery,
        {
            fetchPolicy: 'cache-and-network',
            nextFetchPolicy: 'cache-first',
            errorPolicy: 'all'
        }
    );

    const refetchCart = useCallback(() => {
        if (cartId) {
            return fetchCartDetails({ variables: { cartId } });
        }
        return Promise.resolve();
    }, [fetchCartDetails, cartId]);

    const { syncStatus, isSyncing } = useCartSync({
        refetch: refetchCart,
        removeItem,
        cartId
    });

    const hasItems = !!data?.cart?.total_quantity;
    const shouldShowLoadingIndicator = called && loading && !hasItems;

    const cartItems = useMemo(() => {
        return data?.cart?.items || [];
    }, [data]);

    const onAddToWishlistSuccess = useCallback(successToastProps => {
        setWishlistSuccessProps(successToastProps);
    }, []);

    const [, { dispatch }] = useEventingContext();

    useEffect(() => {
        if (!called && cartId) {
            fetchCartDetails({ variables: { cartId } });
        }

        // Let the cart page know it is updating while we're waiting on network data.
        setIsCartUpdating(loading);
    }, [fetchCartDetails, called, cartId, loading, isSyncing]);

    useEffect(() => {
        if (called && cartId && !loading) {
            dispatch({
                type: 'CART_PAGE_VIEW',
                payload: {
                    cart_id: cartId,
                    products: cartItems
                }
            });
        }
    }, [called, cartItems, cartId, loading, dispatch]);

    return {
        cartItems,
        hasItems,
        isCartUpdating,
        fetchCartDetails,
        onAddToWishlistSuccess,
        setIsCartUpdating,
        shouldShowLoadingIndicator,
        wishlistSuccessProps,
        syncStatus,
        isSyncing
    };
};
