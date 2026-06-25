import os
import torch
import torch.nn as nn
import json
from transformers import DistilBertTokenizerFast, DistilBertModel
from typing import Dict, List, Any

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_DIR = os.path.join(BASE_DIR, "models", "classifier-v2")


# Simple LabelEncoder replacement using JSON-serializable data
class SimpleLabelEncoder:
    def __init__(self, classes: List[Any] = None):
        self.classes_ = classes or []
        self._class_to_idx = {cls: idx for idx, cls in enumerate(self.classes_)}

    def fit(self, y: List[Any]):
        self.classes_ = sorted(list(set(y)))
        self._class_to_idx = {cls: idx for idx, cls in enumerate(self.classes_)}
        return self

    def transform(self, y: List[Any]) -> List[int]:
        return [self._class_to_idx[cls] for cls in y]

    def inverse_transform(self, y: List[int]) -> List[Any]:
        return [self.classes_[idx] for idx in y]


# We must use the exact same class definition as trainer_v2
class MultiOutputClassifierV2(nn.Module):
    def __init__(self, num_labels_per_output: dict):
        super().__init__()
        self.bert = DistilBertModel.from_pretrained("distilbert-base-uncased")
        hidden = self.bert.config.hidden_size 
        self.dropout = nn.Dropout(0.2)
        self.heads = nn.ModuleDict()
        for name, n_labels in num_labels_per_output.items():
            self.heads[name] = nn.Linear(hidden, n_labels)

    def forward(self, input_ids, attention_mask):
        outputs = self.bert(input_ids=input_ids, attention_mask=attention_mask)
        cls_output = outputs.last_hidden_state[:, 0] 
        cls_output = self.dropout(cls_output)
        logits = {name: head(cls_output) for name, head in self.heads.items()}
        return logits


class ClassifierServiceV2:
    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # 1. Load Config
        config_path = os.path.join(MODEL_DIR, "model_config.json")
        if not os.path.exists(config_path):
            self.model = None
            print(f"[WARN] V2 Model config not found at {config_path}")
            return

        with open(config_path, "r") as f:
            self.num_labels = json.load(f)

        # 2. Load Encoders (try JSON first, fall back to pickle for compatibility)
        label_encoders_path_json = os.path.join(MODEL_DIR, "label_encoders.json")
        label_encoders_path_pkl = os.path.join(MODEL_DIR, "label_encoders.pkl")
        
        if os.path.exists(label_encoders_path_json):
            with open(label_encoders_path_json, "r") as f:
                label_encoders_data = json.load(f)
            self.label_encoders = {
                col: SimpleLabelEncoder(classes) 
                for col, classes in label_encoders_data.items()
            }
        elif os.path.exists(label_encoders_path_pkl):
            import pickle
            print("[WARN] Loading legacy pickle label encoders - please convert to JSON!")
            with open(label_encoders_path_pkl, "rb") as f:
                sklearn_encoders = pickle.load(f)
            # Convert sklearn LabelEncoders to our safe SimpleLabelEncoder
            self.label_encoders = {
                col: SimpleLabelEncoder(le.classes_.tolist()) 
                for col, le in sklearn_encoders.items()
            }
        else:
            self.label_encoders = {}
            print("[WARN] No label encoders found!")

        # 3. Load Model - use weights_only=True for safety
        self.model = MultiOutputClassifierV2(self.num_labels).to(self.device)
        model_path = os.path.join(MODEL_DIR, "model.pt")
        self.model.load_state_dict(torch.load(model_path, map_location=self.device, weights_only=True))
        self.model.eval()

        # 4. Load Tokenizer
        self.tokenizer = DistilBertTokenizerFast.from_pretrained(MODEL_DIR)
        print("[SUCCESS] Classifier Service V2 (Shadow) Loaded Successfully.")

    def predict(self, text: str):
        if self.model is None:
            return {"error": "V2 Model not initialized"}

        inputs = self.tokenizer(
            text, 
            return_tensors="pt", 
            truncation=True, 
            padding=True, 
            max_length=256 # V2 uses 256
        ).to(self.device)

        with torch.no_grad():
            logits = self.model(inputs["input_ids"], inputs["attention_mask"])
            
        results = {}
        for col, le in self.label_encoders.items():
            probs = torch.softmax(logits[col], dim=1)
            conf, pred_idx = torch.max(probs, dim=1)
            results[col] = {
                "prediction": le.inverse_transform([pred_idx.item()])[0],
                "confidence": float(conf.item())
            }
        
        # Map V2 'Priority' (capitalized) to generic response
        if "Priority" in results:
            results["priority"] = results.pop("Priority")

        return results

# Singleton instance
classifier_v2 = ClassifierServiceV2()
