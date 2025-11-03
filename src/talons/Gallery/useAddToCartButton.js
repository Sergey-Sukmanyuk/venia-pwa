import { useCallback, useState } from 'react';
import { useMutation, gql } from '@apollo/client';
import { useHistory } from 'react-router-dom';

import { useCartContext } from '@magento/peregrine/lib/context/cart';
import { useEventingContext } from '@magento/peregrine/lib/context/eventing';
import resourceUrl from '@magento/peregrine/lib/util/makeUrl';
import operations from '@magento/peregrine/lib/talons/Gallery/addToCart.gql';
import { useAwaitQuery } from '@magento/peregrine/lib/hooks/useAwaitQuery';
import BrowserPersistence from '@magento/peregrine/lib/util/simplePersistence';
import { useAppContext } from '@magento/peregrine/lib/context/app';
import { addToOfflineCart } from '../../util/offlineCart';


/**
 * @param {String} props.item.uid - uid of item
 * @param {String} props.item.name - name of item
 * @param {String} props.item.stock_status - stock status of item
 * @param {String} props.item.__typename - product type
 * @param {String} props.item.url_key - item url key
 * @param {String} props.item.sku - item sku
 *
 * @returns {
 *      handleAddToCart: Function,
 *      isDisabled: Boolean,
 *      isInStock: Boolean
 * }
 *
 */
const UNSUPPORTED_PRODUCT_TYPES = [
    'VirtualProduct',
    'BundleProduct',
    'GroupedProduct',
    'DownloadableProduct'
];

const CREATE_CART_MUTATION = gql`
    mutation createCart {
        cartId: createEmptyCart
    }
`;

const CART_DETAILS_QUERY = gql`
    query checkUserIsAuthed($cartId: String!) {
        cart(cart_id: $cartId) {
            id
        }
    }
`;

export const useAddToCartButton = props => {
    const { item, urlSuffix } = props;
    const [{ isOnline }] = useAppContext();
    const [, { dispatch }] = useEventingContext();

    const [isLoading, setIsLoading] = useState(false);

    const [cartState, cartApi] = useCartContext();
    const { cartId } = cartState;

    const [fetchCartId] = useMutation(CREATE_CART_MUTATION);
    const fetchCartDetails = useAwaitQuery(CART_DETAILS_QUERY);

    const isInStock = item.stock_status === 'IN_STOCK';

    const productType = item
        ? item.__typename !== undefined
            ? item.__typename
            : item.type
        : null;

    const isUnsupportedProductType = UNSUPPORTED_PRODUCT_TYPES.includes(
        productType
    );

    const isDisabled = isLoading || !isInStock || isUnsupportedProductType;

    const history = useHistory();

    const [addToCart] = useMutation(operations.ADD_ITEM);

    // helper: ensure we have a valid cartId before adding
    const ensureCartId = useCallback(async () => {
        let newCartId = cartId;
        if (!newCartId) {
            await cartApi.getCartDetails({
                fetchCartId,
                fetchCartDetails
            });
            newCartId = new BrowserPersistence().getItem('cartId');
        }
        return newCartId;
    }, [cartId, cartApi, fetchCartId, fetchCartDetails]);

    const handleAddToCart = useCallback(async () => {
        try {
            setIsLoading(true);
            const quantity = 1;
            const productData = {
                sku: item.sku,
                name: item.name,
                quantity,
                price: item.price_range?.maximum_price?.final_price?.value,
                currency: item.price_range?.maximum_price?.final_price?.currency
            };

            if (!isOnline) {
                addToOfflineCart(productData);
                setIsLoading(false);
            }

            const newCartId = await ensureCartId();
            if (isOnline) {
                await addToCart({
                    variables: {
                        cartId: newCartId,
                        cartItem: {
                            quantity,
                            sku: item.sku
                        }
                    }
                });
            }

            dispatch({
                type: 'CART_ADD_ITEM',
                payload: {
                    ...productData,
                    cartId: newCartId
                }
            });
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, [
        item,
        isOnline,
        ensureCartId,
        addToCart,
        dispatch
    ]);

    return {
        handleAddToCart,
        isDisabled: isLoading || item.stock_status !== 'IN_STOCK',
        isInStock: item.stock_status === 'IN_STOCK'
    };
};
