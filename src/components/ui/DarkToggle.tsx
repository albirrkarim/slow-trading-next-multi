import { IconButton } from "@mui/material";
import { useColorMode } from "./ClientProvider";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";


export default function DarkToggle() {
    const { themeName, toggleTheme } = useColorMode();
    return (

        <IconButton
            color="inherit"
            onClick={toggleTheme}
            size="small"
            title={themeName === "DARK" ? "Switch to light mode" : "Switch to dark mode"}
        >
            {themeName === "DARK" ? <Brightness7Icon /> : <Brightness4Icon />}
        </IconButton>
    )
}
