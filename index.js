import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';
import 'dart:convert';
import 'dart:developer';

class AnalyticsPage extends StatefulWidget {
  const AnalyticsPage({Key? key}) : super(key: key);

  @override
  _AnalyticsPageState createState() => _AnalyticsPageState();
}

class _AnalyticsPageState extends State<AnalyticsPage> {
  List<FlSpot> scoreDataPoints = [];
  List<DateTime> sessionDates = []; // List to store session dates for x-axis
  bool loadingError = false; // Add a flag to indicate if there was an error during loading

  @override
  void initState() {
    super.initState();
    _loadScoreData();
  }

  Future<void> _loadScoreData() async {
    try {
      final response = await http
          .get(Uri.parse('$apiBaseUrl/sessions/aggregated')) // Fetch aggregated data for analytics
          .timeout(const Duration(seconds: 10)); // Set a timeout of 10 seconds

      if (response.statusCode == 200) {
        List<dynamic> sessionList = jsonDecode(response.body);
        List<FlSpot> points = [];
        List<DateTime> dates = [];
        for (int index = 0; index < sessionList.length; index++) {
          var data = sessionList[index];
          double averageScore = (data['average_score'] ?? 0).toDouble();
          points.add(FlSpot(index.toDouble(), averageScore));
          dates.add(DateTime.parse(data['date'])); // Store the date
        }
        setState(() {
          scoreDataPoints = points;
          sessionDates = dates;
          loadingError = false; // Reset the error flag on successful load
        });
      } else {
        throw Exception('Failed to load session data, status code: ${response.statusCode}');
      }
    } catch (e) {
      log('Error loading score data: $e');
      // Set the loadingError flag to true and display an error message
      setState(() {
        loadingError = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Analytics"),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: loadingError
            ? Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.error, color: Colors.red, size: 48),
                    const SizedBox(height: 16),
                    Text(
                      "Failed to load data. Please try again.",
                      style: Theme.of(context).textTheme.bodyText1,
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: _loadScoreData,
                      child: const Text("Retry"),
                    ),
                  ],
                ),
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "Score Progression Over Time",
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 20),
                  Expanded(
                    child: LineChart(
                      LineChartData(
                        minX: 0,
                        maxX: scoreDataPoints.isNotEmpty ? scoreDataPoints.length.toDouble() - 1 : 1,
                        minY: 0,
                        lineBarsData: [
                          LineChartBarData(
                            spots: scoreDataPoints,
                            isCurved: true,
                            color: Colors.blue,
                            barWidth: 3,
                            belowBarData: BarAreaData(show: false),
                            dotData: FlDotData(show: true),
                          ),
                        ],
                        titlesData: FlTitlesData(
                          leftTitles: AxisTitles(
                            sideTitles: SideTitles(showTitles: true, reservedSize: 40),
                          ),
                          bottomTitles: AxisTitles(
                            sideTitles: SideTitles(
                              showTitles: true,
                              getTitlesWidget: (value, meta) {
                                int index = value.toInt();
                                if (index < 0 || index >= sessionDates.length) return const SizedBox();
                                var date = sessionDates[index];
                                return Padding(
                                  padding: const EdgeInsets.only(top: 8.0),
                                  child: Text(
                                    DateFormat('dd/MM').format(date),
                                    style: const TextStyle(fontSize: 10),
                                  ),
                                );
                              },
                            ),
                          ),
                        ),
                        gridData: FlGridData(show: true),
                        borderData: FlBorderData(show: true),
                      ),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}
