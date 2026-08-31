import { Alert, Button, type DialogProps, type ButtonProps } from '@mui/material'
import { type SxProps, type Theme } from '@mui/system'
import React, { useEffect, useState, type ReactNode } from 'react'
import DialogBlur from './DialogBlur'

// Extending ButtonProps to include specific props for ButtonDialog
export interface ButtonDialogProps extends Omit<ButtonProps, 'children'> {
    children: (props: any) => ReactNode
    title: any
    titleLong?: string
    maxWidth?: DialogProps["maxWidth"]
    customButton?: (handleOpen: () => void) => ReactNode
    forceFullscreen?: boolean
    useAppBar?: boolean
    defaultOpen?: boolean
    beforeClose?: () => void
    boxSx?: SxProps<Theme>
    contentSx?: SxProps<Theme>
}

/**
 * `ButtonDialog` is a component that encapsulates a button triggering a dialog with custom content.
 * It abstracts away the state management and button/dialog coupling, providing a more streamlined way to create dialogs in your application.
 *
 * @param {ReactNode} children - A function that returns the content to be displayed in the dialog. It receives a function to close the dialog.
 * @param {string} title - The title for the button; defaults to 'Create' if not provided.
 * @param {string} [titleLong] - An optional longer title used for the dialog.
 * @param {'xs' | 'sm' | 'md' | 'lg' | 'xl'} [maxWidth='sm'] - Maximum width of the dialog.
 * @param {(handleOpen: () => void) => ReactNode} [customButton] - A function that returns a custom button element. It receives a function to open the dialog.
 * @param {boolean} [forceFullscreen] - If true, the dialog will be fullscreen regardless of screen size.
 * @param {boolean} [useAppBar] - If true, the fullscreen dialog uses an app bar with its title and close action.
 * @param {boolean} [defaultOpen=false] - If true, the dialog will be open by default.
 * @param {() => void} [beforeClose] - A function that will be called before the dialog closes.
 * @param {SxProps<Theme>} [boxSx={}] - Optional sx props to apply styling to the dialog's box container.
 * @param {SxProps<Theme>} [contentSx={}] - Optional sx props for the dialog content area.
 * @param {ButtonProps} buttonProps - The rest of the MUI ButtonProps to be passed to the button element.
 *
 * @returns {React.JSX.Element} A React component containing a button that, when clicked, opens a dialog.
 *
 * @example
 * <ButtonDialog
 *   title="Open Form"
 *   titleLong="Fill out this form"
 *   maxWidth="md"
 *   customButton={handleOpen => (
 *     <Button variant="outlined" onClick={handleOpen}>
 *       Custom Button
 *     </Button>
 *   )}
 *   beforeClose={() => console.log('Dialog is about to close')}
 *   boxSx={{ p: 2 }}
 * >
 *   {handleClose => (
 *     <Form onClose={handleClose} />
 *   )}
 * </ButtonDialog>
 */

export default function ButtonDialog({
    children,
    title = 'Create',
    titleLong,
    maxWidth = 'sm',
    customButton,
    forceFullscreen,
    useAppBar,
    defaultOpen = false,
    beforeClose,
    boxSx = {},
    contentSx = {},
    ...buttonProps // Collecting the rest of the props for the Button component
}: ButtonDialogProps): React.JSX.Element {
    const [open, setOpen] = useState<boolean>(defaultOpen)

    const handleClose = (): void => {
        if (typeof beforeClose === 'function') {
            beforeClose()
        }
        setOpen(false)
    }

    const handleOpen = (): void => {
        setOpen(true)
    }

    // eslint-disable-next-line
    useEffect(() => {

        return () => {
            handleClose()
        } // Cleanup on unmount
        // eslint-disable-next-line
    }, [])

    return (
        <>
            {customButton ? (
                customButton(handleOpen)
            ) : (
                <Button
                    variant="contained"
                    onClick={handleOpen}
                    color="primary"
                    title={title}
                    {...buttonProps} // Spreading the collected props onto the Button
                >
                    {title}
                </Button>
            )}

            <DialogBlur title={titleLong ?? title} open={open} maxWidth={maxWidth} onClose={handleClose} forceFullscreen={forceFullscreen} useAppBar={useAppBar} sx={boxSx} contentSx={contentSx}>
                {open && <>{children ? children(handleClose) : <Alert severity="warning">ButtonDialog children must be a function</Alert>}</>}
            </DialogBlur>
        </>
    )
}
