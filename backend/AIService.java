package OpenPDF;


import org.springframework.stereotype.Service;


@Service
public class AIService {



    public String answer(
            String prompt
    ){


        /*
        Example future output:

        User:
        "Delete page 3"

        AI:

        {
            action:"DELETE_PAGE",
            page:3
        }

        */


        if(prompt.contains("delete")){

            return """
            {
              "action":"DELETE_PAGE",
              "page":3
            }
            """;

        }


        return "AI response placeholder";

    }

}