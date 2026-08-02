package com.openpdf;

import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/pdf")
@CrossOrigin
public class PDFController {

    private final PDFService pdfService;
    private final AIService aiService;

    public PDFController(PDFService pdfService, AIService aiService) {
        this.pdfService = pdfService;
        this.aiService = aiService;
    }

    @PostMapping("/upload")
    public String upload(@RequestParam("file") MultipartFile file) throws Exception {
        File uploadsDir = new File("uploads");
        if (!uploadsDir.exists()) uploadsDir.mkdirs();

        File saved = new File(uploadsDir, file.getOriginalFilename());
        file.transferTo(saved);
        return saved.getAbsolutePath();
    }

    @GetMapping("/file")
    public ResponseEntity<Resource> getFile(
            @RequestParam String path,
            @RequestParam(required = false, defaultValue = "false") boolean download
    ) throws Exception {
        File file = new File(path);
        Resource resource = new UrlResource(file.toURI());
        String disposition = (download ? "attachment" : "inline") + "; filename=\"" + file.getName() + "\"";

        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
                .body(resource);
    }

    @PostMapping("/apply-order")
    public Map<String, String> applyOrder(@RequestBody OrderRequest request) {
        String newPath = pdfService.applyPageOrder(request.getPath(), request.getOrder());
        return Map.of("path", newPath);
    }

    @PostMapping("/split")
    public Map<String, List<String>> split(@RequestBody SplitRequest request) {
        List<String> paths = pdfService.splitPdf(request.getPath(), request.getSplitPoints());
        return Map.of("files", paths);
    }

@PostMapping("/merge")
public Map<String, String> merge(@RequestBody MergeRequest request) {
    String path = pdfService.mergePdfs(request.getPaths());
    return Map.of("path", path);
}

    @PostMapping("/delete-page")
    public String deletePage(@RequestParam String path, @RequestParam int page) {
        pdfService.deletePage(path, page);
        return "Page deleted";
    }

    @PostMapping("/html-to-pdf")
    public Map<String, String> htmlToPdf(@RequestBody Map<String, String> payload) {
        String html = payload.get("html");
        String fileName = payload.getOrDefault("fileName", "html-export");
        String path = pdfService.htmlToPdf(html, fileName);
        return Map.of("path", path);
    }

    @PostMapping("/chat")
    public String chat(@RequestBody String prompt) {
        return aiService.answer(prompt);
    }
}