import { IconButton } from "@mui/material";
import Logout from "@mui/icons-material/Logout";

export default function ButtonLogout() {
    const handleLogout = async () => {
        try {
            await fetch("/api/pin/logout", { method: "POST" });
        } finally {
            const next = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.assign(`/pin?next=${next}`);
        }
    };
    return (

        <IconButton
            color="inherit"
            onClick={handleLogout}
            size="small"
            aria-label="Logout"
        >
            <Logout />
        </IconButton>
    )
}