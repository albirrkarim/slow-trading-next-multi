import CloseIcon from '@mui/icons-material/Close'
import type { DialogProps } from '@mui/material';
import { AppBar, Box, Dialog, DialogContent, IconButton, Toolbar, Typography, useMediaQuery, useTheme } from '@mui/material'
import { type SxProps, type Theme } from '@mui/system'
import React from 'react'

// Interface for the DialogBlur props
export interface DialogBlurProps {
  id?: string // The id of the dialog
  title: string // The title of the dialog
  open: boolean // Controls if the dialog is open or closed
  onClose: () => void // Function to call when the dialog requests to be closed
  maxWidth?: DialogProps["maxWidth"]
  breakpoints?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' // Breakpoint at which the dialog switches to fullScreen
  useAppBar?: boolean // If true, uses the AppBar design for the dialog
  forceFullscreen?: boolean | null // Forces fullscreen mode if true
  children: React.ReactNode // Children to render inside the dialog
  centerDialog?: boolean // If true, vertically centers the dialog
  sx?: SxProps<Theme> // Custom styles
  contentSx?: SxProps<Theme> // Custom styles for the dialog content area
  [key: string]: any // Any other props
}

/**
 * DialogBlur is a dialog component that applies a blur effect to the backdrop.
 * It can conditionally render an AppBar for the title and close action, and it becomes fullscreen based on specified breakpoints.
 *
 * @param {DialogBlurProps} props - Destructured props for the component.
 * @returns {JSX.Element} The DialogBlur component wrapped around the children content.
 *
 * @example
 * <DialogBlur
 *   title="Confirm Action"
 *   open={isOpen}
 *   onClose={handleClose}
 *   maxWidth="sm"
 *   forceFullscreen={false}
 *   useAppBar={true}
 * >
 *   <Typography variant="body1">Are you sure you want to perform this action?</Typography>
 *   <Button variant="contained" onClick={handleAction}>Yes, I'm sure</Button>
 * </DialogBlur>
 */
const DialogBlur = ({ id, title, open, onClose, maxWidth = 'md', breakpoints = 'sm', useAppBar = false, forceFullscreen = null, children, sx = {}, contentSx = {}, ...rest }: DialogBlurProps) => {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down(breakpoints))


  const handleClose = (event: any, reason: 'backdropClick' | 'escapeKeyDown'): void => {
    if (reason && reason !== 'backdropClick') {
      onClose()
    }
  }

  return (
    <Dialog
      fullScreen={forceFullscreen ?? fullScreen}
      fullWidth
      maxWidth={maxWidth}
      open={open}
      onClose={handleClose}
      disableScrollLock
      disableEnforceFocus
      hideBackdrop
      sx={{
        '& .MuiDialog-container': {
          alignItems: 'flex-start'
        }
      }}
      slotProps={{
        paper: {
          sx: {
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            backgroundColor: theme.palette.background.blur,
            touchAction: 'manipulation',
            ...sx
          }
        }
      }}
    >
      {forceFullscreen === true ? (
        <>
          {useAppBar && (
            <AppBar
              color="info"
              elevation={0}
              sx={{
                position: 'relative'
              }}
            >
              <Toolbar variant="dense" disableGutters sx={{ minHeight: 40, px: 1 }}>
                <Typography component="h2" variant="subtitle1" sx={{ flex: 1 }}>
                  {title}
                </Typography>
                <IconButton
                  edge="end"
                  color="inherit"
                  size="small"
                  onClick={onClose}
                  aria-label="close"
                  title="Close dialog"
                >
                  <CloseIcon />
                </IconButton>
              </Toolbar>
            </AppBar>
          )}
          <DialogContent
            data-testid="fullscreen-dialog-scroll-content"
            sx={[
              {
                backgroundColor: 'transparent',
                flex: 1,
                minHeight: 0,
                m: 0,
                overflowY: 'auto',
                overscrollBehaviorY: 'contain',
                p: 0,
                touchAction: 'pan-x pan-y',
                WebkitOverflowScrolling: 'touch',
              },
              ...(Array.isArray(contentSx) ? contentSx : [contentSx]),
            ]}
            {...rest}
          >
            <Box sx={{ minWidth: 0 }}>{children}</Box>
          </DialogContent>
        </>
      ) : (
        <Box id={id}>
          <Box sx={{ display: "flex", justifyContent: "space-between", p: 1, pb: 0 }}>
            <Typography variant="h6" component="div">{title}</Typography>
            <IconButton onClick={onClose} title="Close dialog" size="small">
              <CloseIcon />
            </IconButton>
          </Box>
          <DialogContent
            sx={[
              {
                backgroundColor: 'transparent',
                m: 0,
                p: 1,
                pt: 0,
              },
              ...(Array.isArray(sx) ? sx : [sx]),
              ...(Array.isArray(contentSx) ? contentSx : [contentSx]),
            ]}
            {...rest}
          >
            <Box>{children}</Box>
          </DialogContent>
        </Box>
      )}
    </Dialog>
  )
}

export default DialogBlur
