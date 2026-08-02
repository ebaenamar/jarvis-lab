package com.openpdf;

import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.nio.file.Files;

@RestController
@RequestMapping("/pdf")
@CrossOrigin
public class PDFController {

    private final PDFService pdfService;
    private final AIService aiService;


    public PDFController(
            PDFService pdfService,
            AIService aiService
    ){
        this.pdfService = pdfService;
        this.aiService = aiService;
    }


    @PostMapping("/upload")
    public String upload(
            @RequestParam("file") MultipartFile file
    ) throws Exception {


        File saved =
            new File("uploads/" + file.getOriginalFilename());


        file.transferTo(saved);


        return saved.getAbsolutePath();
    }



    @PostMapping("/delete-page")
    public String deletePage(
            @RequestParam String path,
            @RequestParam int page
    ){

        pdfService.deletePage(path,page);

        return "Page deleted";
    }



    @PostMapping("/chat")
    public String chat(
            @RequestBody String prompt
    ){

        return aiService.answer(prompt);

    }
}