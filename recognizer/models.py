from django.db import models


class PracticeAttempt(models.Model):
    """Stores individual Practice Arena sign challenges for Student Progress analytics."""

    language = models.CharField(max_length=10, default="asl")
    target_letter = models.CharField(max_length=24)
    predicted_letter = models.CharField(max_length=24, blank=True, default="")
    is_correct = models.BooleanField(default=False)
    confidence = models.FloatField(default=0.0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        status = "OK" if self.is_correct else "SKIP/MISS"
        return f"[{self.language.upper()}] {self.target_letter} ({status})"
