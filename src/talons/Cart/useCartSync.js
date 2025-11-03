import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppContext } from '@magento/peregrine/lib/context/app';
import { useToasts } from '@magento/peregrine/lib/Toasts';
import { useMutation } from '@apollo/client';
import operations from '@magento/peregrine/lib/talons/Gallery/addToCart.gql';
import { getOfflineCart, clearOfflineCart } from '../../util/offlineCart';

export const useCartSync = props => {
    const { refetch, removeItem, cartId } = props;

    const [{ isOnline }] = useAppContext();
    const [, { addToast }] = useToasts();

    const [syncStatus, setSyncStatus] = useState(
        isOnline ? 'synced' : 'offline'
    );
    const prevIsOnlineRef = useRef(isOnline);
    const isSyncingRef = useRef(false);
    const [addToCart] = useMutation(operations.ADD_ITEM);

    const handleCartSync = useCallback(async () => {
        if (!isOnline || !cartId || isSyncingRef.current) return;

        isSyncingRef.current = true;
        setSyncStatus('syncing');

        try {
            const offlineItems = getOfflineCart();

            if (offlineItems.length > 0) {
                for (const item of offlineItems) {
                    try {
                        await addToCart({
                            variables: {
                                cartId,
                                cartItem: {
                                    sku: item.sku,
                                    quantity: item.quantity
                                }
                            }
                        });
                    } catch (err) {
                        console.warn(`Failed to sync ${item.sku}`, err);
                    }
                }

                clearOfflineCart();

                addToast({
                    type: 'info',
                    message: 'Offline items synchronized successfully.',
                    timeout: 4000
                });
            }

            await refetch();
            setSyncStatus('synced');
        } catch (err) {
            console.error('Cart sync failed:', err);
            setSyncStatus('synced');
            addToast({
                type: 'error',
                message:
                    'Error during cart synchronization. Please check your network.',
                timeout: 5000
            });
        } finally {
            isSyncingRef.current = false;
        }
    }, [isOnline, cartId, refetch, addToCart, addToast]);

    useEffect(() => {
        if (!isOnline) {
            setSyncStatus('offline');
        } else if (isOnline && !prevIsOnlineRef.current) {
            handleCartSync();
        }
        prevIsOnlineRef.current = isOnline;
    }, [isOnline, handleCartSync]);

    return {
        syncStatus,
        isSyncing: syncStatus === 'syncing'
    };
};
