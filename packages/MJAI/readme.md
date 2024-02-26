# @memberjunction/ai

The `@memberjunction/ai` library provides a generic layer for using any number of different AI models and classes of AI models with an abstract approach so that code is not closely coupled to a particular vendor's LLM. By using this library you can easily switch your code from one AI model to another.

The way it works you would install this package and then install the preferred AI model package - for example `@memberjunction/ai-openai` or `@memberjunction/ai-mistral`. When you do that you can then do one of two approaches for getting your LLM
classes to use:

1) Directly instantiate the sub-class from the selected package(s). In the case of Mistral, you could 
`const mistralLLM = new MistralLLM(apiKey);` 
2) Alternatively, if you want to further abstract your code base so that you have run time optionality, you could instead use the MemberJunction Class Factory which is part of the `@memberjunction/global` package with code along these lines:
`const genericLLM = MJGlobal.Instance.ClassFactory.CreateInstance(BaseLLM, '', apiKey);`

When you use the ClassFactory, you get the highest registered class for a given base class, so you automatically get whatever package is installed for the implementation of the generic layer.