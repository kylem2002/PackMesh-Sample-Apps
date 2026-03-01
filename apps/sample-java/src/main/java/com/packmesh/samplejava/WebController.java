package com.packmesh.samplejava;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class WebController {
    /**
     * Serves the playground page and injects the PackMesh API base URL used by client-side calls.
     *
     * @param model MVC model passed to the Thymeleaf template.
     * @return the view name to render.
     */
    @GetMapping("/")
    public String index(Model model) {
        // Expose the API base URL to the template so JavaScript can build endpoint paths.
        model.addAttribute("baseUrl", "https://packmesh-api-prod-adhqddbbcnbadkhb.canadacentral-01.azurewebsites.net/api");
        return "index";
    }
}
