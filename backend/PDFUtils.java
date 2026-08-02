package OpenPDF;


import com.lowagie.text.pdf.PdfReader;


public class PDFUtils {


    public static int getPageCount(
            String file
    ){

        try {

            PdfReader reader =
                    new PdfReader(file);


            int pages =
                    reader.getNumberOfPages();


            reader.close();


            return pages;


        }catch(Exception e){

            throw new RuntimeException(e);

        }

    }

}