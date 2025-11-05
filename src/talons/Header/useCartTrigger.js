import { useCallback, useState, useEffect } from 'react';
import { useQuery } from '@apollo/client';
import { useHistory, useLocation } from 'react-router-dom';

import { useCartContext } from '@magento/peregrine/lib/context/cart';
import { useDropdown } from '@magento/peregrine/lib/hooks/useDropdown';
import { getOfflineCart } from '../../util/offlineCart';
import { useAppContext } from '@magento/peregrine/lib/context/app';
import BrowserPersistence from '@magento/peregrine/lib/util/simplePersistence';

/**
 * Routes to hide the mini cart on.
 */
const DENIED_MINI_CART_ROUTES = ['/checkout'];

function getCartIdFromLocalStorage() {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const keys = [
        'M2_VENIA_BROWSER_PERSISTENCE__cartId',
        'M2_VENIA_BROWSER_PERSISTENCE__cart_id',
        'm2_venia_browser_persistence__cartId'
    ];
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        try {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            try {
                const obj = JSON.parse(raw);
                if (obj && typeof obj === 'object' && obj.value !== undefined && obj.value !== null) {
                    try {
                        const inner = JSON.parse(obj.value);
                        if (typeof inner === 'string' && inner.length) return inner;
                    } catch (e) {
                        if (typeof obj.value === 'string' && obj.value.length) return obj.value.replace(/^"|"$/g, '');
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

/**
 *
 * @returns {
 *      itemCount: Number,
 *      miniCartIsOpen: Boolean,
 *      handleLinkClick: Function,
 *      handleTriggerClick: Function,
 *      miniCartRef: Function,
 *      hideCartTrigger: Function,
 *      setMiniCartIsOpen: Function
 *  }
 */
export const useCartTrigger = props => {
    const {
        queries: { getItemCountQuery }
    } = props;

    const [{ cartId }] = useCartContext();
    const history = useHistory();
    const location = useLocation();
    const [isHidden, setIsHidden] = useState(() =>
        DENIED_MINI_CART_ROUTES.includes(location.pathname)
    );

    const {
        elementRef: miniCartRef,
        expanded: miniCartIsOpen,
        setExpanded: setMiniCartIsOpen,
        triggerRef: miniCartTriggerRef
    } = useDropdown();
    const storage = new BrowserPersistence();

    const { data, refetch } = useQuery(getItemCountQuery, {
        fetchPolicy: 'cache-and-network',
        variables: {
            cartId
        },
        skip: !cartId,
        errorPolicy: 'all'
    });

    const [{ isOnline }] = useAppContext();

    const [offlineCount, setOfflineCount] = useState(() => {
        const offlineItems = getOfflineCart();
        return offlineItems.reduce((sum, it) => sum + (it.quantity || 0), 0);
    });

    const [serverItemCount, setServerItemCount] = useState(undefined);

    useEffect(() => {
        const update = () => {
            const offlineItems = getOfflineCart();
            setOfflineCount(
                offlineItems.reduce((sum, it) => sum + (it.quantity || 0), 0)
            );
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

        const tryRefetch = async () => {
            try {
                if (!isOnline) return;

                if (cartId) {
                    if (typeof refetch === 'function') {
                        try {
                            const res = await refetch({ cartId });
                            const count = res && res.data && res.data.cart && res.data.cart.total_summary_quantity_including_config;
                            if (mounted) setServerItemCount(typeof count === 'number' ? count : 0);
                        } catch (e) {
                            console.warn('[useCartTrigger] refetch with context cartId failed', e);
                        }
                    }
                    return;
                }

                const storageCartId = getCartIdFromLocalStorage();
                if (storageCartId && typeof refetch === 'function') {
                    try {
                        const res = await refetch({ cartId: storageCartId });
                        const count = res && res.data && res.data.cart && res.data.cart.total_summary_quantity_including_config;
                        if (mounted) setServerItemCount(typeof count === 'number' ? count : 0);
                    } catch (e) {
                        console.warn('[useCartTrigger] refetch with storage cartId failed', e);
                    }
                }
            } catch (e) {
                console.warn('[useCartTrigger] tryRefetch error', e);
            }
        };

        tryRefetch();

        window.addEventListener('offlineCartChanged', tryRefetch);
        window.addEventListener('storage', tryRefetch);

        return () => {
            mounted = false;
            window.removeEventListener('offlineCartChanged', tryRefetch);
            window.removeEventListener('storage', tryRefetch);
        };
    }, [isOnline, cartId, refetch]);

    var itemCount;
    if (isOnline) {
        if (data && data.cart && typeof data.cart.total_summary_quantity_including_config === 'number') {
            itemCount = data.cart.total_summary_quantity_including_config;
        } else if (typeof serverItemCount === 'number') {
            itemCount = serverItemCount;
        } else {
            itemCount = 0;
        }
    } else {
        itemCount = offlineCount;
    }

    const handleTriggerClick = useCallback(() => {
        setMiniCartIsOpen(function (isOpen) {
            return !isOpen;
        });
    }, [setMiniCartIsOpen]);

    const handleLinkClick = useCallback(() => {
        history.push('/cart');
    }, [history]);

    useEffect(() => {
        setIsHidden(DENIED_MINI_CART_ROUTES.includes(location.pathname));
    }, [location]);

    return {
        handleLinkClick,
        handleTriggerClick,
        itemCount,
        miniCartIsOpen,
        miniCartRef,
        hideCartTrigger: isHidden,
        setMiniCartIsOpen,
        miniCartTriggerRef
    };
};
export default useCartTrigger;
